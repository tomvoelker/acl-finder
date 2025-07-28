# 🚀 Deployment Guide

## Quick Setup for GitHub Pages

### 1. Enable GitHub Pages
1. Go to your repository settings
2. Scroll to "Pages" section
3. Under "Source", select **"GitHub Actions"**
4. Save settings

### 2. Configure Repository
Your repository should have this structure:
```
├── .github/workflows/deploy.yml  ✅ (Already created)
├── index.html                    ✅ (Main search page)
├── author.html                   ✅ (Author profiles)  
├── authors.html                  ✅ (Author directory)
├── papers.json                   ✅ (4,091 papers)
├── authors.json                  ✅ (15,658 authors)
├── favicon.svg                   ✅ (Site icon)
└── README.md                     ✅ (Documentation)
```

### 3. Deploy
```bash
# Commit all files
git add .
git commit -m "🚀 Deploy ACL 2025 search website"
git push origin main
```

### 4. Access Your Site
- **URL**: `https://[YOUR-USERNAME].github.io/[REPO-NAME]/`
- **Build status**: Check Actions tab in GitHub
- **Deploy time**: ~2-3 minutes

## 🔧 Advanced Configuration

### Custom Domain (Optional)
1. Add `CNAME` file with your domain
2. Configure DNS with your provider
3. Enable HTTPS in Pages settings

### Repository Settings
- **Permissions**: Public repository recommended
- **Actions**: Must be enabled
- **Pages**: Source set to "GitHub Actions"

### File Size Considerations
- `papers.json`: ~4MB (within GitHub limits)
- `authors.json`: ~22MB (within GitHub limits)
- Total deployment: ~26MB (well within 1GB limit)

## 🚨 Troubleshooting

### Build Failures
- Check Actions tab for error details
- Ensure all required files are present
- Verify file permissions and encoding

### Site Not Loading
- Wait 5-10 minutes after first deployment
- Check GitHub Pages settings
- Verify repository is public (if using free GitHub)

### Large File Issues
If files are too large:
- Use Git LFS for large JSON files
- Consider data compression
- Split data into smaller chunks

## 🔄 Updating Content

### New Paper Data
1. Replace `papers.json` and `authors.json`
2. Commit and push to `main`
3. Site rebuilds automatically

### Design Changes
1. Edit HTML/CSS files
2. Test locally first
3. Push changes to deploy

## 📊 Performance

- **First load**: ~26MB download
- **Subsequent visits**: Cached (fast)
- **Search**: Client-side (instant)
- **CDN**: Global GitHub Pages network

---

**🎉 Your ACL 2025 search site is ready to deploy!**