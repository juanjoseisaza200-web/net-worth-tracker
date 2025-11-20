# How to Share Your Net Worth Tracker App

There are several ways to share your app with friends. Here are the easiest options:

## Option 1: Deploy to Vercel (Recommended - Easiest)

Vercel is free and very easy to use:

1. **Install Vercel CLI** (if you don't have it):
   ```bash
   npm install -g vercel
   ```

2. **Deploy from your project folder**:
   ```bash
   cd net-worth-tracker
   vercel
   ```

3. **Follow the prompts**:
   - It will ask you to login (create a free account if needed)
   - Press Enter to confirm the project settings
   - It will deploy and give you a URL like: `https://your-app-name.vercel.app`

4. **Share the URL** with your friend!

**Note**: For updates, just run `vercel` again from the project folder.

---

## Option 2: Deploy to Netlify (Also Easy)

1. **Install Netlify CLI**:
   ```bash
   npm install -g netlify-cli
   ```

2. **Build the app first**:
   ```bash
   npm run build
   ```

3. **Deploy**:
   ```bash
   netlify deploy --prod
   ```

4. **Follow the prompts** and share the URL!

---

## Option 3: Deploy via GitHub Pages

1. **Create a GitHub repository** and push your code

2. **Install gh-pages**:
   ```bash
   npm install --save-dev gh-pages
   ```

3. **Add to package.json scripts**:
   ```json
   "scripts": {
     "deploy": "npm run build && gh-pages -d dist"
   }
   ```

4. **Deploy**:
   ```bash
   npm run deploy
   ```

5. **Enable GitHub Pages** in your repo settings and share the URL

---

## Option 4: Quick Testing with ngrok (Temporary)

For quick testing (temporary URL that expires):

1. **Install ngrok**:
   - Download from https://ngrok.com
   - Or: `brew install ngrok` (on Mac)

2. **Start your dev server**:
   ```bash
   npm run dev
   ```

3. **In another terminal, run ngrok**:
   ```bash
   ngrok http 3000
   ```

4. **Share the ngrok URL** (e.g., `https://abc123.ngrok.io`)

**Note**: This is temporary and the URL changes each time you restart ngrok.

---

## Option 5: Build and Host Static Files

1. **Build the app**:
   ```bash
   npm run build
   ```

2. **The `dist` folder** contains all the static files

3. **Upload the `dist` folder** to any web hosting service:
   - Any web hosting (shared hosting, VPS, etc.)
   - Cloud storage with static hosting (AWS S3, Google Cloud Storage, etc.)

---

## Recommended: Vercel (Option 1)

**Why Vercel?**
- ✅ Free forever
- ✅ Very easy to use
- ✅ Automatic HTTPS
- ✅ Fast global CDN
- ✅ Easy updates (just run `vercel` again)
- ✅ No credit card required

**Quick Start with Vercel:**
```bash
npm install -g vercel
cd net-worth-tracker
vercel
```

That's it! You'll get a URL to share.

---

## Important Notes

- **Data Storage**: The app stores data in the browser's localStorage, so each user's data stays on their device
- **No Backend Needed**: This is a static app, so it works on any static hosting
- **Updates**: After making changes, rebuild and redeploy

---

## Troubleshooting

If you get errors during deployment:
1. Make sure you've run `npm install` first
2. Make sure the build works locally: `npm run build`
3. Check that all files are committed to git (if using GitHub)

