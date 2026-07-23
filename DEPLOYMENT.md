# PyPath Website Deployment Guide

## Step 1: Push to GitHub (or GitLab/Bitbucket)

### Option A: Create a new GitHub repository

1. Go to [GitHub.com](https://github.com) and sign in
2. Click the "+" icon → "New repository"
3. Name it (e.g., "mypypath")
4. **Don't** initialize with README, .gitignore, or license
5. Click "Create repository"

### Option B: Push your code to GitHub

Run these commands in your terminal:

```bash
cd /path/to/mypypath

# Add GitHub remote (replace YOUR_USERNAME and REPO_NAME)
git remote add origin https://github.com/adamissac/mypypath.git

# Push to GitHub
git branch -M main
git push -u origin main
```

## Step 2: Deploy to Vercel

### Method 1: Using Vercel Dashboard (Recommended)

1. Go to [vercel.com](https://vercel.com) and sign up/login (use GitHub to sign in)
2. Click "Add New..." → "Project"
3. Import your GitHub repository (the one you just created)
4. Vercel will auto-detect it's a static site
5. **Important Settings:**
   - Framework Preset: **Other**
   - Root Directory: `./` (leave as default)
   - Build Command: (leave empty)
   - Output Directory: (leave empty)
6. Click "Deploy"
7. Wait for deployment to complete (~1-2 minutes)
8. You'll get a URL like: `your-project.vercel.app`

### Method 2: Using Vercel CLI

```bash
# Install Vercel CLI globally
npm i -g vercel

# Login to Vercel
vercel login

# Deploy (from your project directory)
cd /path/to/mypypath
vercel

# Follow the prompts:
# - Set up and deploy? Yes
# - Which scope? (select your account)
# - Link to existing project? No
# - Project name? pypath-website
# - Directory? ./
# - Override settings? No
```

## Step 3: Connect Your GoDaddy Domain

### In Vercel Dashboard:

1. Go to your project dashboard on Vercel
2. Click on the "Settings" tab
3. Click "Domains" in the sidebar
4. Enter your domain (e.g., `yourdomain.com` or `www.yourdomain.com`)
5. Click "Add"

### In GoDaddy Dashboard:

1. Log in to [GoDaddy.com](https://godaddy.com)
2. Go to "My Products" → "Domains" → Click "DNS" or "Manage DNS"
3. You'll need to update DNS records:

#### For Root Domain (yourdomain.com):

**Option A: Use A Record (Recommended)**
- Type: **A**
- Name: `@` (or leave blank)
- Value: `76.76.21.21` (Vercel's IP)
- TTL: 600 (or default)

**Option B: Use CNAME (Easier)**
- Type: **CNAME**
- Name: `@`
- Value: `cname.vercel-dns.com`
- TTL: 600

#### For www Subdomain (www.yourdomain.com):

- Type: **CNAME**
- Name: `www`
- Value: `cname.vercel-dns.com`
- TTL: 600

### After Adding DNS Records:

1. Go back to Vercel dashboard → Domains
2. Vercel will show you the exact DNS records needed
3. Copy those records and add them to GoDaddy
4. Wait 5-60 minutes for DNS propagation
5. Vercel will automatically issue SSL certificate (HTTPS)

## Step 4: Verify Everything Works

1. Visit your domain: `https://yourdomain.com`
2. Check that HTTPS is working (padlock icon)
3. Test all pages and functionality
4. Check mobile responsiveness

## Troubleshooting

### DNS Not Working?
- Wait up to 24-48 hours for full DNS propagation
- Use [whatsmydns.net](https://www.whatsmydns.net) to check DNS propagation
- Make sure you removed any conflicting DNS records

### SSL Certificate Issues?
- Vercel automatically provisions SSL certificates
- Wait 5-10 minutes after DNS is configured
- Make sure DNS records are correct

### Site Not Updating?
- Make sure you pushed changes to GitHub
- Vercel auto-deploys on git push
- Check Vercel dashboard for deployment status

## Future Updates

Whenever you make changes:

```bash
cd /path/to/mypypath
git add .
git commit -m "Your commit message"
git push
```

Vercel will automatically redeploy your site!

## Need Help?

- Vercel Docs: https://vercel.com/docs
- Vercel Support: https://vercel.com/support
- GoDaddy Support: https://www.godaddy.com/help

