const nextConfig = {
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "10.0.0.*",
    "192.168.*.*",
  ],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
