import app, { ready } from "../app.js";

export default async function handler(req, res) {
  await ready;
  return app(req, res);
}

