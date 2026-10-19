import { installViewportZoomGuards } from "./viewportZoomGuards";
import { bootstrap } from "./app/bootstrap";
import "./shared/styles/index.css";
import "./shared/styles/client.css";

installViewportZoomGuards();
void bootstrap();
