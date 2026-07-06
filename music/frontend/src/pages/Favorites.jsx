import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client"; 
import "../pages/Dashboard.css"; 

export default function Favorites() {
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const handleBackToInput = () => {
    navigate("/dashboard"); 
  };


  // Fetch favorites from backend
  useEffect(() => {
    const fetchFavorites = async () => {
      try {
        const res = await api.get("/favorites");
        setFavorites(res.data);
      } catch (err) {
        console.error("Failed to load favorites", err);
      } finally {
        setLoading(false);
      }
    };
    fetchFavorites();
  }, []);

  // Delete a favorite
  const deleteFavorite = async (id) => {
    try {
      await api.delete(`/favorites/${id}`);
      setFavorites(favorites.filter((f) => f.id !== id));
    } catch (err) {
      console.error("Failed to delete favorite", err);
    }
  };

  if (loading) return <p className="text-center">Loading favorites...</p>;

  return (
    <div style={{ padding: "2rem" }}>
      <h2 className="text-xl font-bold mb-4">Your Favorites:</h2>

      {favorites.length === 0 ? (
        <p>No favorites yet.</p>
      ) : (
        <div className="songs-grid">
          {favorites.map((fav, idx) => (
            <div key={idx} className="song-card">
              <img
                src={fav.cover}
                alt={fav.track_name}
                className="album-cover"
              />
              <h3 className="track-name">{fav.track_name}</h3>
              <p className="artist-name">{fav.artist}</p>
              <a
                href={fav.url}
                target="_blank"
                rel="noreferrer"
                className="spotify-link"
              >
                Spotify
              </a>
              <button
                className="fav-btn"
                onClick={() => deleteFavorite(fav.id)}
              >
                ❌
              </button>
            </div>
          ))}
        </div>
      )}

      <button className="back-btn" onClick={handleBackToInput}>
        ← Back to Mood Input
      </button>
    </div>
  );


}
