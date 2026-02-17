import app from "./app.js";
import { config } from "./config/env.js";

app.listen(config.PORT, () => {
    console.log(`🚀 Server running on http://localhost:${config.PORT}`);
});
