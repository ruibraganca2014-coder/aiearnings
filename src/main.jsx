import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import TraderSite from "./TraderSite.jsx";
import Admin from "./Admin.jsx";
import Legal from "./Legal.jsx";

function App() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  // #admin → administração; #legal → páginas legais; resto → site público
  if (hash.startsWith("#admin")) return <Admin />;
  if (hash.startsWith("#legal")) return <Legal />;
  return <TraderSite />;
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
