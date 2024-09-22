const fs = require('fs');
const path = require('path');

// Resolve the directory from where the module is imported
const moduleDir = path.dirname(require.main?.filename || process.mainModule?.filename ? process.mainModule?.filename : process.env?.TEMP);
const CACHE_DIR = path.join(moduleDir, '.justcacheitcache');

// Ensure the cache directory exists for "fs" storage
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR);
}

// In-memory cache store
const cache = new Map();

// Function to handle file-based caching (for "fs" store)
function cacheToFile(key, cacheEntry) {
  const filePath = path.join(CACHE_DIR, encodeURIComponent(key));
  fs.writeFileSync(filePath, JSON.stringify(cacheEntry), 'utf8'); // Serialize cacheEntry before writing
}

function readFromFile(key) {
  const filePath = path.join(CACHE_DIR, encodeURIComponent(key));
  if (fs.existsSync(filePath)) {
    const cachedData = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(cachedData); // Deserialize data when reading
  }
  return null;
}

function cacheMiddleware({ browser = 300, server = 600, store = "fs" } = {}) {
  return (req, res, next) => {
    const key = req.originalUrl;

    // Initialize the cache object on the request
    req.cache = {
      hit: false,
      stale: false,
      revalidating: false,
      miss: false,
      bypass: false,
      type: store,
      fresh: false
    };

    let cachedData;

    // Check the cache store type and retrieve the cached data
    if (store === "mem") {
      cachedData = cache.get(key);
    } else if (store === "fs") {
      cachedData = readFromFile(key);
    }

    // If cached data exists
    if (cachedData) {
      const cacheAge = Date.now() - cachedData.timestamp;
      if (cacheAge <= server * 1000) {
        // If data is within the server cache time, it's a HIT
        req.cache.hit = true;
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('Cache-Control', `public, max-age=${browser}`);
        return res.send(cachedData.body);
      } else {
        // Data is stale, so we serve stale data but indicate it's stale
        req.cache.stale = true;
        req.cache.revalidating = true;
        res.setHeader('X-Cache', 'STALE');
        res.setHeader('Cache-Control', `public, max-age=${browser}`);
        
        // Serve stale data
        res.send(cachedData.body);
        
        // In the background, revalidate the cache
        res.on('finish', () => {
          // Revalidate and update the cache in the background
          const originalSend = res.send.bind(res);
          res.send = (newBody) => {
            const cacheEntry = { body: newBody, timestamp: Date.now() };

            // Cache data according to store type
            if (store === "mem") {
              cache.set(key, cacheEntry); // Memory-based cache
            } else if (store === "fs") {
              cacheToFile(key, cacheEntry); // File-based cache (serialized)
            }

            console.log(`Caching ${key} for server-side (${store}) for ${server} seconds`);
            res.setHeader('X-Cache', 'REVALIDATING');

            // Clear cache after SERVER_CACHE_TIME
            setTimeout(() => {
              if (store === "mem") {
                cache.delete(key);
              } else if (store === "fs") {
                const filePath = path.join(CACHE_DIR, encodeURIComponent(key));
                if (fs.existsSync(filePath)) {
                  fs.unlinkSync(filePath); // Remove the cached file
                }
              }
              console.log(`Cleared ${key} from server-side cache (${store})`);
            }, server * 1000);

            req.cache.hit = false;
            req.cache.miss = false;
            req.cache.bypass = false;
            req.cache.stale = false;
            req.cache.fresh = false;
            req.cache.revalidating = false;

            originalSend(newBody);
          };

          // Trigger cache update with a new request if needed
          // (This logic might require a separate mechanism or request to fetch fresh data)
        });

        return;
      }
    } else {
      // If no cached data exists, mark it as a MISS
      req.cache.miss = true;
      res.setHeader('X-Cache', 'MISS');
    }

    // Set browser cache headers for new data
    res.setHeader('Cache-Control', `public, max-age=${browser}`);

    // Modify response to cache data before sending it
    const originalSend = res.send.bind(res);
    res.send = (body) => {
      const cacheEntry = { body, timestamp: Date.now() };

      // Cache data according to store type
      if (store === "mem") {
        cache.set(key, cacheEntry); // Memory-based cache
      } else if (store === "fs") {
        cacheToFile(key, cacheEntry); // File-based cache (serialized)
      }

      console.log(`Caching ${key} for server-side (${store}) for ${server} seconds`);
      res.setHeader('X-Cache', 'FRESH'); // Or any suitable header for a fresh cache
      req.cache.fresh = true

      // Clear cache after SERVER_CACHE_TIME
      setTimeout(() => {
        if (store === "mem") {
          cache.delete(key);
        } else if (store === "fs") {
          const filePath = path.join(CACHE_DIR, encodeURIComponent(key));
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath); // Remove the cached file
          }
        }
        console.log(`Cleared ${key} from server-side cache (${store})`);
      }, server * 1000);

      req.cache.hit = false;
      req.cache.miss = false;
      req.cache.bypass = false;
      req.cache.stale = false;
      req.cache.fresh = false;
      req.cache.revalidating = false;

      originalSend(body);
    };

    next();
  };
}

// Function to clear the cache, checking both memory and filesystem
function clearCache({ url = null } = {}) {
  if (url) {
    // Clear specific cache item from both memory and filesystem
    const key = encodeURIComponent(url);

    // Remove from memory
    cache.delete(key);

    // Remove from filesystem
    const filePath = path.join(CACHE_DIR, key);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    console.log(`Cleared cache for ${url}`);
  } else {
    // Clear entire cache from memory and filesystem

    // Memory cache
    cache.clear();

    // Filesystem cache
    fs.readdirSync(CACHE_DIR).forEach((file) => {
      fs.unlinkSync(path.join(CACHE_DIR, file));
    });

    console.log('Cleared the entire cache');
  }
}

// Exports for CommonJS
module.exports = {
  cache: cacheMiddleware,
  purge: clearCache,
};

// Exports for ES6 modules
exports.cache = cacheMiddleware;
exports.purge = clearCache;
