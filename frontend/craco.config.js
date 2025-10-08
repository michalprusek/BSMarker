module.exports = {
  devServer: (devServerConfig) => {
    // Override webpack-dev-server client configuration
    devServerConfig.client = {
      ...devServerConfig.client,
      webSocketURL: {
        protocol: 'wss',
        hostname: 'your-domain.example.com',
        port: 443,
        pathname: '/ws',
      },
    };

    // Disable host check for development behind proxy
    devServerConfig.allowedHosts = 'all';

    return devServerConfig;
  },
};
