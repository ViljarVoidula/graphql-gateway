const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  entry: {
    admin: './src/client/index.tsx',
    docs: './src/client/docs/index.tsx'
  },
  output: {
    path: path.resolve(__dirname, 'dist/client'),
    filename: '[name].bundle.js',
    // Use root publicPath so both /admin and /docs bundles can be requested directly
    // e.g. /admin.bundle.js, /docs.bundle.js. The gateway will serve these as static assets.
    publicPath: '/'
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    modules: [path.resolve(__dirname, 'src/client'), 'node_modules']
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: path.resolve(__dirname, 'tsconfig.client.json'),
            transpileOnly: true // Skip type checking for faster builds
          }
        },
        include: path.resolve(__dirname, 'src/client'),
        exclude: /node_modules/
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
        include: [path.resolve(__dirname, 'src/client'), path.resolve(__dirname, 'node_modules')]
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'asset/resource',
        include: path.resolve(__dirname, 'src/client'),
        exclude: /node_modules/
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/client/public/index.html',
      filename: 'index.html',
      chunks: ['admin'],
      excludeChunks: ['docs']
    }),
    new HtmlWebpackPlugin({
      template: './src/client/public/index.html',
      filename: 'docs.html',
      chunks: ['docs'],
      excludeChunks: ['admin']
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'src/client/public/assets',
          to: 'assets',
          noErrorOnMissing: true
        }
      ]
    })
  ],
  devServer: {
    static: [
      {
        directory: path.join(__dirname, 'dist/client')
      },
      {
        directory: path.join(__dirname, 'src/client/public'),
        publicPath: '/'
      }
    ],
    port: 3040,
    // Serve both /admin and /docs SPAs from same dev server.
    // We provide explicit rewrites so /docs routes get docs.html and others fall back to index.html
    historyApiFallback: {
      rewrites: [
        { from: /^\/docs$/, to: '/docs.html' },
        { from: /^\/docs\/.*/, to: '/docs.html' },
        { from: /^\/admin$/, to: '/index.html' },
        { from: /^\/admin\/.*/, to: '/index.html' }
      ]
    },
    proxy: [
      {
        context: ['/graphql', '/health'],
        target: 'http://localhost:4000',
        changeOrigin: true
      }
    ]
  }
};
