import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import './i18n'; // Import i18n configuration
import { initErrorReporter } from './errorReporter';

initErrorReporter();

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <React.Suspense fallback="Loading...">
      <App />
    </React.Suspense>
  </React.StrictMode>,
);
