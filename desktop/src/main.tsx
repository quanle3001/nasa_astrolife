import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { MotionPreferenceProvider } from "@/lib/motion-preference";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<StrictMode><MotionPreferenceProvider><App /></MotionPreferenceProvider></StrictMode>);
