# 🔍 ACL 2025 Paper & Author Search

A comprehensive, beautiful search interface for ACL 2025 conference papers with complete author information and workshop coverage.

## ✨ Features

### 📚 **Complete Conference Coverage**
- **4,091 papers** from all tracks and workshops
- **33 different tracks**: Main Conference, Findings, Industry, 30+ workshops
- **15,658 unique authors** with full bibliographic data
- **Complete ACL Anthology integration** with direct links

### 🔍 **Powerful Search & Filtering**
- **Real-time fuzzy search** across titles, abstracts, authors, paper numbers
- **Track/Workshop filtering** - browse specific conferences and workshops
- **Advanced filters**: presentation type, attendance, dates
- **Author profile pages** with complete publication lists
- **Cross-linked navigation** between papers and authors

### 🎨 **Beautiful Interface**
- **Modern, responsive design** with gradient headers and smooth animations
- **Color-coded track badges** for easy identification
- **Expandable abstracts** with read more/less functionality
- **Professional favicon** with ACL 2025 branding
- **Mobile-optimized** interface

### ⚡ **Performance Optimized**
- **Debounced search** for smooth typing experience
- **Pagination** for large result sets (20 papers per page)
- **Hybrid search strategy** - fast for short queries, comprehensive for long ones
- **Static deployment** - works on any web server

## 🚀 Quick Start

### Local Development
```bash
python -m http.server 8000
# Open http://localhost:8000
```

### Static Deployment
Upload these files to any static hosting service:
- `index.html` - Main search interface
- `author.html` - Individual author profile page  
- `authors.html` - Author directory
- `papers.json` - Complete paper database (4,091 papers)
- `authors.json` - Author profiles (15,658 authors)
- `favicon.svg` - Beautiful ACL 2025 favicon

**Deployment platforms**: GitHub Pages, Netlify, Vercel, AWS S3, etc.

## 📊 Data Coverage

### Conference Tracks
- **Main Conference**: 1,699 papers (Long + Short)
- **Findings of ACL**: 1,387 papers
- **Industry Track**: 109 papers
- **System Demonstrations**: 64 papers
- **Student Research Workshop**: 86 papers

### Workshops & Shared Tasks (Sample)
- **Building Educational Applications**: 103 papers
- **International Workshop on Spoken Language Translation**: 44 papers
- **BioNLP Workshop**: 34 papers
- **CoNLL Shared Task**: 40 papers
- **30+ additional workshops**: 500+ papers

## 🔗 Navigation Features

### Paper View
- **Track badges** with color coding
- **Author tags** linking to author profiles
- **ACL Anthology links** to official paper pages
- **Expandable abstracts** with full text
- **Scheduling information** when available

### Author Profiles
- **Complete publication lists** from ACL 2025
- **Co-author networks** with clickable links
- **Publication statistics** by track type
- **Presenter indicators** for papers they're presenting

## 💻 Technology Stack

- **Frontend**: Pure HTML/CSS/JavaScript (no frameworks)
- **Search**: Fuse.js with performance optimizations
- **Icons**: Font Awesome 6.0
- **Data**: JSON from official ACL BibTeX files
- **Design**: Modern CSS with gradients, shadows, animations

## 🎯 Example Searches

- **Find an author**: "Andreas Hotho" → View profile → Browse papers
- **Explore workshops**: Filter by "BioNLP Workshop" → Browse 34 papers
- **Paper lookup**: Search "LLäMmlein" → View complete author list
- **Track browsing**: Filter "Main Conference" → 1,699 papers

## 📁 File Structure

```
├── index.html          # Main search interface
├── author.html         # Author profile template  
├── authors.html        # Author directory
├── papers.json         # Complete paper database
├── authors.json        # Author profiles & statistics
├── favicon.svg         # ACL 2025 branded favicon
└── README.md          # This file
```

---

**Ready to deploy!** 🚀 This is a complete, production-ready search interface for ACL 2025.