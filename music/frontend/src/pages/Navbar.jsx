import { Link, useNavigate } from "react-router-dom";
import { isAuthed, clearToken } from "../auth/token";
import "./Navbar.css";
import { useEffect } from "react";
export default function Navbar() {
  const nav = useNavigate();

  const handleLogout = () => {
    clearToken();
    nav("/login");
  };

  // useEffect(() => {
  //   const toggler = document.querySelector(".navbar-toggler");
  //   const collapse = document.getElementById("navMenu");
  //   const links = document.querySelectorAll("#navMenu .nav-link, #navMenu .nav-button");

  //   if (toggler && collapse) {
  //     toggler.addEventListener("click", () => {
  //       collapse.classList.toggle("show");
  //       window.scrollTo({ top: 0, behavior: "smooth" });
  //     });
  //   }

  //   links.forEach((link) =>
  //     link.addEventListener("click", () => {
  //       if (collapse.classList.contains("show")) {
  //         collapse.classList.remove("show");
  //       }
  //     })
  //   );
  // }, []);

  return (
    <nav className="navbar navbar-expand-lg navbar-dark custom-navbar">
      <div className="container-fluid d-flex justify-content-between align-items-center">
        {/* Left side: Brand */}
        <Link className="navbar-brand brand-gradient mb-0" to="/">
          SPOTIFY MOOD THERAPY
        </Link>

        {/* Toggler for mobile */}
        <button
          className="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#navMenu"
          aria-controls="navMenu"
          aria-expanded="false"
          aria-label="Toggle navigation"
        >
          <span className="navbar-toggler-icon"></span>
        </button>

        {/* Right side: Links */}
        <div className="collapse navbar-collapse justify-content-end" id="navMenu">
          <ul className="navbar-nav d-flex align-items-center nav-links">
            {isAuthed() ? (
              <>
                <li className="nav-item">
                  <Link to="/favorites" className="nav-link hover-slide me-2">
                    Favorites
                  </Link>
                </li>
                <li className="nav-item">
                  <button onClick={handleLogout} className="nav-button">
                    Logout
                  </button>
                </li>
              </>
            ) : (
              <>
                <li className="nav-item">
                  <Link to="/login" className="nav-link hover-slide me-2">
                    Login
                  </Link>
                </li>
                <li className="nav-item">
                  <Link to="/signup" className="nav-button">
                    Sign Up
                  </Link>
                </li>
              </>
            )}
          </ul>
        </div>
      </div>
    </nav>
  );
}
