#!/bin/bash
# Script to automatically deploy wiki content to GitHub

set -e

echo "🚀 Deploying Wiki to GitHub..."

# Check if gh is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) is required but not installed."
    echo "Install with: brew install gh"
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "wiki-enhanced.md" ]; then
    echo "❌ wiki-enhanced.md not found. Are you in the right directory?"
    exit 1
fi

# Clone the wiki repository
echo "📥 Cloning wiki repository..."
rm -rf .wiki-temp
git clone https://github.com/Lykhoyda/ask-gemini-mcp.wiki.git .wiki-temp 2>/dev/null || {
    echo "⚠️  Wiki doesn't exist yet. Creating it through GitHub..."
    # Create initial wiki page through API
    gh api repos/Lykhoyda/ask-gemini-mcp/wiki/pages \
        --method POST \
        -f title="Home" \
        -f body="Initializing wiki..." || true
    
    # Try cloning again
    git clone https://github.com/Lykhoyda/ask-gemini-mcp.wiki.git .wiki-temp
}

cd .wiki-temp

# Function to extract section from wiki-enhanced.md
extract_section() {
    local section_name="$1"
    local output_file="$2"
    local start_pattern="$3"
    local end_pattern="$4"
    
    awk "/$start_pattern/,/$end_pattern/" ../wiki-enhanced.md | 
    tail -n +2 | 
    head -n -1 > "$output_file"
}

echo "📄 Creating wiki pages..."

# Home page
awk '/^## Home Page \(Welcome\)/,/^---$/' ../wiki-enhanced.md | tail -n +2 | head -n -2 > Home.md

# Getting Started
awk '/^## Getting Started$/,/^---$/' ../wiki-enhanced.md | tail -n +2 | head -n -2 > Getting-Started.md

# User Guide  
awk '/^## User Guide$/,/^---$/' ../wiki-enhanced.md | tail -n +2 | head -n -2 > User-Guide.md

# Examples
awk '/^## Examples$/,/^---$/' ../wiki-enhanced.md | tail -n +2 | head -n -2 > Examples.md

# Development
awk '/^## Development$/,/^---$/' ../wiki-enhanced.md | tail -n +2 | head -n -2 > Development.md

# API Reference
awk '/^## API Reference$/,/^---$/' ../wiki-enhanced.md | tail -n +2 | head -n -2 > API-Reference.md

# Troubleshooting
awk '/^## Troubleshooting$/,/^---$/' ../wiki-enhanced.md | tail -n +2 | head -n -2 > Troubleshooting.md

# Roadmap
awk '/^## Roadmap$/,/^---$/' ../wiki-enhanced.md | tail -n +2 | head -n -2 > Roadmap.md

# Community & Support
awk '/^## Community & Support$/,/^---$/' ../wiki-enhanced.md | tail -n +2 | head -n -2 > Community-&-Support.md

# Create sidebar for navigation
cat > _Sidebar.md << 'EOF'
## 🏠 Navigation

**Getting Started**
* [[Home]]
* [[Getting Started|Getting-Started]]
* [[User Guide|User-Guide]]
* [[Examples]]

**Reference**
* [[API Reference|API-Reference]]
* [[Troubleshooting]]

**Contributing**
* [[Development]]
* [[Roadmap]]
* [[Community & Support|Community-&-Support]]

---

**Quick Links**
* [📦 NPM Package](https://www.npmjs.com/package/ask-gemini-mcp)
* [🐙 GitHub Repo](https://github.com/Lykhoyda/ask-gemini-mcp)
* [📋 Report Issue](https://github.com/Lykhoyda/ask-gemini-mcp/issues/new)
EOF

# Create footer
cat > _Footer.md << 'EOF'
---
📄 [MIT License](https://github.com/Lykhoyda/ask-gemini-mcp/blob/main/LICENSE) | 
🔧 [Contribute](https://github.com/Lykhoyda/ask-gemini-mcp/blob/main/CONTRIBUTING.md) | 
📦 [NPM](https://www.npmjs.com/package/ask-gemini-mcp) |
⭐ [Star on GitHub](https://github.com/Lykhoyda/ask-gemini-mcp)
EOF

# Commit and push
echo "💾 Committing changes..."
git add -A
git commit -m "📚 Deploy comprehensive wiki documentation

- Added all major sections from wiki-enhanced.md
- Created navigation sidebar
- Added footer with quick links
- Structured content for easy navigation" || echo "No changes to commit"

echo "📤 Pushing to GitHub..."
git push origin master || git push origin main

cd ..
rm -rf .wiki-temp

echo "✅ Wiki deployed successfully!"
echo "🔗 View at: https://github.com/Lykhoyda/ask-gemini-mcp/wiki"
echo ""
echo "📝 Note: It may take a few seconds for changes to appear on GitHub."
