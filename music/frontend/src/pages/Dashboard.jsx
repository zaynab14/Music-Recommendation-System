import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client"; // your axios instance with JWT header
import { clearToken } from "../auth/token";
import "./Dashboard.css";

export default function Dashboard() {
  const nav = useNavigate();
  const [vibe, setVibe] = useState("");
  const [keywords, setKeywords] = useState("");
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const logout = () => {
    clearToken();
    nav("/login");
  };

  async function handleVibeSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Step 1: Get keywords from LLM
      const { data: vibeRes } = await api.post("/vibe", { vibe });
      if (!vibeRes.keywords) {
        throw new Error("No keywords returned from LLM.");
      }
      setKeywords(vibeRes.keywords);

      // Step 2: Get song recommendations from Spotify
      const { data: recRes } = await api.post("/recommend", {
        keywords: vibeRes.keywords,
      });
      setSongs(recRes.songs);

    } catch (err) {
      if (err.response) {
        if (err.response.status === 400) {
          setError(err.response.data?.error || "Bad request. Check input.");
        } else if (err.response.status === 401) {
          setError("Unauthorized. Please log in again.");
          clearToken();
          nav("/login");
        } else if (err.response.status === 422) {
          setError("Invalid input format. Please enter a proper vibe.");
        } else if (err.response.status === 500) {
          setError("Server error while processing vibe or recommendations.");
        } else {
          setError(err.response.data?.error || "Unexpected server error.");
        }
      } else if (err.request) {
        setError("No response from backend. Is Flask running?");
      } else {
        setError("Request error: " + err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function addToFavorites(song) {
    try {
      await api.post("/favorites", song);
      alert("Added to favorites!");
    } catch {
      alert("Failed to add to favorites.");
    }
  }

  function handleBackToInput() {
    setVibe("");
    setKeywords("");
    setSongs([]);
    setError("");
  }


  return (
  <div className="dashboard-container">
    
    {/* MAIN SECTION */}
    <main className="dashboard-main">
      {error && <div className="error-msg">{error}</div>}

      {!keywords ? (
        // Input Form (shown before recommendations)
        <form className="vibe-form" onSubmit={handleVibeSubmit}>
          <input
            type="text"
            placeholder="What mood of music are you in today?"
            className="vibe-input"
            value={vibe}
            onChange={(e) => setVibe(e.target.value)}
          />
          <button type="submit" className="vibe-btn" disabled={loading}>
            {loading ? "Finding songs..." : "Get Recommendations"}
          </button>
        </form>
      ) : (
        // Recommendations (shown after vibe is processed)
        <div className="results">
          <h2 className="keywords-title">
            Mood interpreted as: <span>{keywords}</span>
          </h2>

          <div className="songs-grid">
            {songs.map((song, idx) => (
              <div key={idx} className="song-card">
                <img
                  src={song.cover}
                  alt={song.track_name}
                  className="album-cover"
                />
                <h3 className="track-name">{song.track_name}</h3>
                <p className="artist-name">{song.artist}</p>
                <a
                  href={song.url}
                  target="_blank"
                  rel="noreferrer"
                  className="spotify-link"
                >
                  Spotify
                </a>
                <button
                  className="fav-btn"
                  onClick={() => addToFavorites(song)}
                >
                  ⭐
                </button>
              </div>
            ))}
          </div>
          <button className="back-btn" onClick={handleBackToInput}>
            ← Back to Mood Input
          </button>
        </div>
      )}
    </main>
  </div>
);

}
