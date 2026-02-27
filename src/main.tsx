import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { RdkitProvider } from "@/components/RdkitProvider";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RdkitProvider>
      <App />
    </RdkitProvider>
  </React.StrictMode>,
);
