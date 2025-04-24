import NetworkManager from "./NetworkManager.js";
import NeDbWrapper from "./NeDbWrapper.js";

const PORT = 80;
const corsOptions = {
    origin: "*",
    credentials: true
}

const dataManager = new NeDbWrapper();
const networkManager = new NetworkManager(dataManager, PORT, corsOptions);

