const fs = require('fs');
const path = require('path');
const mime = require('mime-types');

const moduleDir = path.dirname(require.main?.filename);
const CACHE_DIR = path.join(moduleDir, '.cache');

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR);
}

// Helper functions
function cacheToFile(key, data, metadata) {
  fs.writeFileSync(path.join(CACHE_DIR, `${encodeURIComponent(key)}.data`), data);
  fs.writeFileSync(path.join(CACHE_DIR, `${encodeURIComponent(key)}.meta`), JSON.stringify(metadata));
}

function readFromCache(key) {
  const dataPath = path.join(CACHE_DIR, `${encodeURIComponent(key)}.data`);
  const metaPath = path.join(CACHE_DIR, `${encodeURIComponent(key)}.meta`);
  if (fs.existsSync(dataPath) && fs.existsSync(metaPath)) {
    const data = fs.readFileSync(dataPath);
    const metadata = JSON.parse(fs.readFileSync(metaPath));
    return { data, metadata };
  }
  return null;
}

function normalizeURL(url) {
  const parsedUrl = new URL(url, 'http://dummy');
  parsedUrl.searchParams.sort();
  return parsedUrl.pathname + parsedUrl.search;
}

function getStatusSet(notCache) {
  const statusSet = new Set();
  notCache.forEach(item => {
    if (typeof item === 'string' && item.includes('-')) {
      const [start, end] = item.split('-').map(Number);
      for (let i = start; i <= end; i++) {
        statusSet.add(i);
      }
    } else {
      statusSet.add(Number(item));
    }
  });
  return statusSet;
}

function cleanupExpiredCache(serverExpiry) {
  const files = fs.readdirSync(CACHE_DIR);
  const now = Date.now();

  files.forEach(file => {
    const metaFilePath = path.join(CACHE_DIR, file);
    if (file.endsWith('.meta')) {
      const metadata = JSON.parse(fs.readFileSync(metaFilePath, 'utf8'));
      if (now - metadata.timestamp > serverExpiry * 1000) {
        const dataFilePath = metaFilePath.replace('.meta', '.data');
        fs.unlinkSync(metaFilePath);
        if (fs.existsSync(dataFilePath)) {
          fs.unlinkSync(dataFilePath);
        }
      }
    }
  });
}

function scheduleCacheCleanup(serverExpiry) {
  setInterval(() => {
    cleanupExpiredCache(serverExpiry)
  }, serverExpiry * 1000);
}

// Middleware
function cacheMiddleware({ browser = 300, server = 600, store = "fs", notCache = ["299-599"] } = {}) {
  const notCacheSet = getStatusSet(notCache);

  // Schedule cache cleanup
  if (store === "fs") {
    scheduleCacheCleanup(server);
  }

  return (req, res, next) => {
    const key = normalizeURL(req.originalUrl);
    const mimeType = mime.lookup(req.originalUrl);

    let cachedData = null;
    if (store === "mem") {
      cachedData = cache.get(key);
    } else if (store === "fs") {
      cachedData = readFromCache(key);
    }

    res.setHeader('Cache-Control', `public, max-age=${browser}`);
    
    if (cachedData && (Date.now() - cachedData.metadata.timestamp <= server * 1000)) {
      res.setHeader('Content-Type', cachedData.metadata.contentType);
      res.setHeader('X-Cache', 'HIT');
      return res.end(cachedData.data);
    }

    const originalSend = res.send.bind(res);
    const originalSendFile = res.sendFile.bind(res);
    res.send = (body) => {
      if (!notCacheSet.has(res.statusCode)) {
        const cacheEntry = {
          body,
          timestamp: Date.now(),
          contentType: res.getHeader('Content-Type') || mimeType || 'text/html',
        };
        if (store === "mem") {
          cache.set(key, cacheEntry);
        } else if (store === "fs") {
          const isBinary = Buffer.isBuffer(body);
          cacheToFile(key, body, { timestamp: Date.now(), contentType: cacheEntry.contentType, isBinary });
        }
      } else {
        res.setHeader('X-Cache', 'BYPASS');
      }
      res.setHeader('X-Cache', 'FRESH');
      originalSend(body);
    };

    res.sendFile = (filePath, options = {}, callback) => {
      const absolutePath = path.resolve(filePath);
      fs.readFile(absolutePath, (err, data) => {
        if (err) return originalSendFile(filePath, options, callback);

        const contentType = mime.lookup(absolutePath) || 'application/octet-stream';
        if (!notCacheSet.has(res.statusCode)) {
          cacheToFile(key, data, { timestamp: Date.now(), contentType, isBinary: true });
        }

        !notCacheSet.has(res.statusCode) ? res.setHeader('X-Cache', 'FRESH') : res.setHeader('X-Cache', 'BYPASS') ;
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', `public, max-age=${browser}`);
        res.end(data);

        if (callback) return callback();
      });
    };

    next();
  };
}

function clearCache({ url = null } = {}) {
  if (url) {
    const key = encodeURIComponent(normalizeURL(url));
    cache.delete(key);

    const dataPath = path.join(CACHE_DIR, `${key}.data`);
    const metaPath = path.join(CACHE_DIR, `${key}.meta`);
    if (fs.existsSync(dataPath)) fs.unlinkSync(dataPath);
    if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);

    console.log(`Cleared cache for ${url}`);
  } else {
    cache.clear();
    
    fs.readdirSync(CACHE_DIR).forEach((file) => {
      fs.unlinkSync(path.join(CACHE_DIR, file));
    });

    console.log('Cleared the entire cache');
  }
}

module.exports = {
  cache: cacheMiddleware,
  purge: clearCache,
};