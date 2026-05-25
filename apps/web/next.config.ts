import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the dev server to accept HMR/asset requests from LAN devices (phone
  // on the same Wi-Fi). Without this, Next blocks cross-origin dev requests.
  allowedDevOrigins: ["192.168.1.101"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com", pathname: "/**" },
    ],
  },
};

export default nextConfig;
