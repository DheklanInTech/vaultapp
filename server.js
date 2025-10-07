import app, { ready, PORT } from "./app.js";

ready.then(() => {
  app.listen(PORT, () => {
    console.log("Server is up and running on PORT:", PORT);
  });
});
