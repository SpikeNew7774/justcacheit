# justcacheit
justcacheit is an NPM Module that can easily cache your endpoints in Express NodeJS

### ES6 Import
```
import express from "express"
const app = express();

import caching from "justcacheit"

const PORT = process.env.PORT || 3000

app.get("/cache-url", caching.cache(), (req, res) => {
    const num = Math.random()
    console.log("Number:", num)
    res.status(200).send("This is a cached response. Number: " + num)
})

app.listen(PORT, () => {
    console.log(`Listening on http://localhost:${PORT}`);
});
```
### CommonJS Import
```
const express = require('express');
const app = express();
const caching = require("justcacheit")

const PORT = process.env.PORT || 3000

app.get("/cache-url", caching.cache(), (req, res) => {
    const num = Math.random()
    console.log("Number:", num)
    res.status(200).send("This is a cached response. Number: " + num)
})

app.listen(PORT, () => {
    console.log(`Listening on http://localhost:${PORT}`);
});
```

## Docs

caching: object;
\
\
caching.cache(): function;
\
\
caching.purge(): function;

- caching.cache({
    - browser: number; (Browser TTL, default=300, seconds),
    - server: number; (Server TTL, default=600, seconds),
    - store: string; (Cache Store, default="fs", options: "fs": FileSystem | "mem": Memory)
- })

- caching.purge({
    - url: string; (URL, if null => Purge All (from Memory and FS))
- })