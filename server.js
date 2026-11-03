const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = __dirname;
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_FILES = new Map([
    ["/", ["index.html", "text/html; charset=utf-8"]],
    ["/index.html", ["index.html", "text/html; charset=utf-8"]],
    ["/login.html", ["login.html", "text/html; charset=utf-8"]],
    ["/signup.html", ["signup.html", "text/html; charset=utf-8"]],
    ["/admin.html", ["admin.html", "text/html; charset=utf-8"]],
    ["/style.css", ["style.css", "text/css; charset=utf-8"]],
    ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
    ["/auth.js", ["auth.js", "text/javascript; charset=utf-8"]],
    ["/admin.js", ["admin.js", "text/javascript; charset=utf-8"]],
    ["/config.js", ["config.js", "text/javascript; charset=utf-8"]]
]);

const server = http.createServer(async (request, response) => {
    let pathname;
    try {
        pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    } catch {
        response.writeHead(400).end("Bad request");
        return;
    }

    const file = PUBLIC_FILES.get(pathname);
    if (!file) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
        return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { Allow: "GET, HEAD" }).end("Method not allowed");
        return;
    }

    try {
        const [fileName, contentType] = file;
        const contents = await fs.readFile(path.join(ROOT, fileName));
        response.writeHead(200, {
            "Content-Type": contentType,
            "Content-Length": contents.length,
            "Cache-Control": "no-cache",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "strict-origin-when-cross-origin"
        });
        response.end(request.method === "HEAD" ? undefined : contents);
    } catch (error) {
        console.error("Could not serve the requested page:", error);
        response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" }).end("Could not serve the page");
    }
});

server.listen(PORT, HOST, () => {
    console.log(`MEALMART is running at http://${HOST}:${PORT}`);
});

server.on("error", (error) => {
    console.error("MEALMART server failed to start:", error);
    process.exitCode = 1;
});
