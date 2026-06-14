/* eslint-disable */
import axios from 'axios';

module.exports = async function () {
  // Configure axios for tests to use.
  const host = process.env.HOST ?? 'localhost';
  const port = process.env.PORT ?? '3000';
  axios.defaults.baseURL = `http://${host}:${port}`;

  // Rewrite /api requests to target versioned API prefix /api/v1
  axios.interceptors.request.use((config) => {
    if (config.url && config.url.startsWith('/api')) {
      config.url = config.url.replace('/api', '/api/v1');
    }
    return config;
  });
};
