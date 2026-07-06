from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_bcrypt import Bcrypt
from flask_jwt_extended import (
    JWTManager, create_access_token, jwt_required, get_jwt_identity)
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.exc import IntegrityError
from dotenv import load_dotenv
import os
import requests
import base64
import logging
import json
import re
import google.generativeai as genai


# Load environment variables
load_dotenv()
logging.basicConfig(level=logging.INFO)
log = logging.getLogger("music-recommender")


# App config
app = Flask(__name__)
CORS(app, supports_credentials=True)

app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv("SUPABASE_DB_URL")
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JWT_SECRET_KEY'] = os.getenv("FLASK_SECRET_KEY")

# Extensions
db = SQLAlchemy(app)
bcrypt = Bcrypt(app)
jwt = JWTManager(app)
GENIE_KEY = os.getenv("GEMINI_API_KEY")
if not GENIE_KEY:
    log.warning("GEMINI_API_KEY not set (will fail /vibe calls).")
genai.configure(api_key=GENIE_KEY)

# Spotify credentials
SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID")
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET")
if not (SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET):
    log.warning("SPOTIFY_CLIENT_ID/SECRET not set")

# Models
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)

class Favorite(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    track_name = db.Column(db.String(120))
    artist = db.Column(db.String(120))
    url = db.Column(db.String(500))
    cover = db.Column(db.String(500))

# Utility to get Spotify access token
def get_spotify_token():
    if not (SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET):
        log.error("Spotify credentials missing.")
        return None
    auth_str = f"{SPOTIFY_CLIENT_ID}:{SPOTIFY_CLIENT_SECRET}"
    b64_auth = base64.b64encode(auth_str.encode()).decode()
    headers = {"Authorization": f"Basic {b64_auth}"}
    data = {"grant_type": "client_credentials"}

    try:
        r = requests.post("https://accounts.spotify.com/api/token", headers=headers, data=data, timeout=10)
        r.raise_for_status()
        return r.json().get("access_token")
    except Exception:
        log.exception("Failed to get Spotify token")
        return None
    

# Accept fenced ```json blocks, plain JSON, or plain text
_CODE_FENCE_RE = re.compile(r"^```(?:json)?\s*([\s\S]*?)\s*```$", re.IGNORECASE)

def strip_code_fences(text: str) -> str:
    if not isinstance(text, str):
        return ""
    m = _CODE_FENCE_RE.match(text.strip())
    return m.group(1).strip() if m else text

def parse_llm_keywords_payload(text: str):
    text = strip_code_fences(text or "")
    # Try JSON first
    try:
        obj = json.loads(text)
        if isinstance(obj, dict):
            vibe = (obj.get("vibe") or "").strip()
            kw = (obj.get("keywords") or obj.get("q") or "").strip()
            return vibe, kw
        if isinstance(obj, list):
            return "", ", ".join(str(x) for x in obj)
    except Exception:
        pass
    # Fallback: treat as raw keywords
    return "", text.strip()

ALLOWED_FILTERS = {"album", "artist", "track", "year", "isrc", "upc", "genre", "tag"}  # tag:new / tag:hipster

def sanitize_spotify_query(raw: str) -> str:
    raw = " ".join((raw or "").split())
    if not raw:
        return ""
    parts, seen = [], set()
    for token in raw.split():
        if ":" in token:
            field, val = token.split(":", 1)
            field = field.lower().strip()
            val = val.strip()
            if not val:
                continue
            if field == "tag":
                tag_token = f"tag:{val.lower()}"
                if tag_token in {"tag:new", "tag:hipster"} and tag_token not in seen:
                    parts.append(tag_token); seen.add(tag_token)
                else:
                    if val not in seen:
                        parts.append(val); seen.add(val)
            elif field in {"album", "artist", "track", "year", "isrc", "upc", "genre"}:
                tok = f"{field}:{val}"
                if tok not in seen:
                    parts.append(tok); seen.add(tok)
            else:
                # Unsupported filter -> keep only the value as a plain keyword
                if val not in seen:
                    parts.append(val); seen.add(val)
        else:
            if token not in seen:
                parts.append(token); seen.add(token)
    return " ".join(parts)


@jwt.unauthorized_loader
def handle_missing_token(msg):
    return jsonify({"error": "Missing Authorization header", "msg": msg}), 401

@jwt.invalid_token_loader
def handle_invalid_token(msg):
    return jsonify({"error": "Invalid token", "msg": msg}), 422

@jwt.expired_token_loader
def handle_expired_token(jwt_header, jwt_payload):
    return jsonify({"error": "Token has expired"}), 401



# Auth routes
@app.route("/signup", methods=["POST"])
def signup():
    data = request.get_json(force=True, silent=True) or {}
    email = data.get("email")
    password = data.get("password")
    if not email or not password:
        return jsonify({"error": "Missing email or password"}), 400

    hashed_pw = bcrypt.generate_password_hash(password).decode("utf-8")
    user = User(email=email, password=hashed_pw)

    try:
        db.session.add(user)
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "Email already exists"}), 409
    except Exception:
        log.exception("Failed to create user")
        return jsonify({"error": "Internal error creating user"}), 500


    token = create_access_token(identity=str(user.id))
    return jsonify({"access_token": token}), 201


@app.route("/login", methods=["POST"])
def login():
    data = request.get_json(force=True, silent=True) or {}
    email = data.get("email")
    password = data.get("password")
    if not email or not password:
        return jsonify({"error": "Missing email or password"}), 400
    
    user = User.query.filter_by(email=email).first()

    if user and bcrypt.check_password_hash(user.password, password):
        token = create_access_token(identity=str(user.id))
        return jsonify({"access_token": token}), 200

    return jsonify({"error": "Invalid credentials"}), 401


# Vibe-to-keywords with OpenAI
@app.route("/vibe", methods=["POST"])
@jwt_required()
def extract_vibe():
    data = request.get_json(force=True, silent=True) or {}
    log.info("Incoming /vibe payload: %s", data)
    vibe = (data.get("vibe") or "").strip()
    if not vibe or not isinstance(vibe, str) or not vibe.strip():
        return jsonify({"error": "Missing vibe input"}), 400


    prompt = (
        "You are a music assistant that converts user mood/vibe text into Spotify Search queries.\n"
        "Return JSON ONLY (no code fences, no markdown, no extra text) with exactly these keys:\n"
        '{ "vibe": "<short description>", "keywords": "<query for Spotify q>" }\n\n'
        "Rules for 'keywords':\n"
        "- Use only supported Spotify filters when applicable: artist:, album:, track:, year:, genre:, isrc:, upc:, tag:new, tag:hipster.\n"
        "- For moods (e.g., chill, energetic, sad), include them as plain words (no mood: prefix).\n"
        "- If an artist or track is mentioned by the user, include artist:<name> or track:<name>.\n"
        "- If a decade or year is mentioned, include year:YYYY or a range like year:1990-1999.\n"
        "- Keep it short and relevant. Do NOT include quotes inside values unless they are part of the name.\n\n"
        "Examples:\n"
        'User: "I want something upbeat to dance to"\n'
        '{ "vibe": "Upbeat and danceable", "keywords": "genre:pop dance upbeat" }\n\n'
        'User: "calm relaxing music for studying from the 2000s"\n'
        '{ "vibe": "Calm study vibe", "keywords": "genre:lofi chill study year:2000-2009" }\n\n'
        f"User input:\n{vibe}\n"
        "JSON:"
    )


    try:
        model = genai.GenerativeModel(model_name="gemini-1.5-flash")
        response = model.generate_content(prompt)
        content = getattr(response, "text", None)
        if not content:
            return jsonify({"error": "No keywords returned from Gemini"}), 500
        # keywords = content.strip()
        # return jsonify({"keywords": keywords}), 200
        vibe, kw = parse_llm_keywords_payload(content)
        q = sanitize_spotify_query(kw)
        if not q:
            return jsonify({"error": "No usable keywords extracted"}), 500
        return jsonify({"vibe": vibe or "Undefined vibe", "keywords": q}), 200

    except Exception as e:
        log.exception("Error in /vibe with Gemini")
        return jsonify({"error": "Gemini API error", "details": str(e)}), 500



# Recommend songs from Spotify
@app.route("/recommend", methods=["POST"])
@jwt_required()
def recommend():
    data = request.get_json(force=True, silent=True) or {}
    log.info("Incoming /recommend payload: %s", data)

    raw = data.get("keywords") or data.get("q") or ""
    vibe_from_client = data.get("vibe")
    if isinstance(raw, str):
        # Try to parse as fenced/JSON payload to extract keywords
        _, maybe_kw = parse_llm_keywords_payload(raw)
        if maybe_kw:
            raw = maybe_kw

    query = sanitize_spotify_query(raw)
    if not query:
        return jsonify({"error": "Missing keywords"}), 400
    
    token = get_spotify_token()
    if not token:
        return jsonify({"error": "Failed to obtain Spotify token"}), 500
    headers = {"Authorization": f"Bearer {token}"}
    params = {"q": query, "type": "track", "limit": 5, "market": "US"}

    try:
        r = requests.get("https://api.spotify.com/v1/search", headers=headers, params=params)
        r.raise_for_status()
        items = r.json().get("tracks", {}).get("items", [])

        songs = []
        for t in items:
            songs.append({
                "track_name": t.get("name"),
                "artist": (t.get("artists") or [{}])[0].get("name"),
                "url": t.get("external_urls", {}).get("spotify"),
                "cover": ((t.get("album") or {}).get("images") or [{}])[0].get("url", "")
            })

        return jsonify({
            "songs": songs,
            "keywords_used": query,
            "vibe": vibe_from_client
        }), 200

    except Exception as e:
        log.exception("Spotify recommend error")
        return jsonify({"error": "Spotify API error", "details": str(e)}), 500

    

# CRUD for favorites
@app.route("/favorites", methods=["GET"])
@jwt_required()
def get_favorites():
    uid = get_jwt_identity()
    try:
        favs = Favorite.query.filter_by(user_id=uid).all()
        return jsonify([{
            "id": f.id,
            "track_name": f.track_name,
            "artist": f.artist,
            "url": f.url,
            "cover": f.cover
        } for f in favs]), 200
    except Exception:
        log.exception("Failed to fetch favorites")
        return jsonify({"error": "Failed to fetch favorites"}), 500


@app.route("/favorites", methods=["POST"])
@jwt_required()
def add_favorite():
    data = request.get_json()
    uid = get_jwt_identity()
    fav = Favorite(
        user_id=uid,
        track_name=data.get("track_name"),
        artist=data.get("artist"),
        url=data.get("url"),
        cover=data.get("cover")
    )
    db.session.add(fav)
    db.session.commit()
    return jsonify({"message": "Favorite added"}), 201


@app.route("/favorites/<int:id>", methods=["DELETE"])
@jwt_required()
def delete_favorite(id):
    uid =int(get_jwt_identity())
    fav = Favorite.query.get_or_404(id)
    if fav.user_id != uid:
        return jsonify({"error": "Unauthorized"}), 403
    db.session.delete(fav)
    db.session.commit()
    return jsonify({"message": "Favorite deleted"}), 200


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"}), 200


# Run
if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    app.run(debug=True)