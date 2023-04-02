# Personal Blog
This is my personal blog built using [Hugo](https://gohugo.io/) and hosted on [GitHub Pages](https://pages.github.com/).

## Requirements
You will need Hugo installed locally. You can install it on MacOS with Homebrew:
```bash
brew install hugo
```

## Initial setup
```bash
# Generate a new Hugo site and change into that directory
hugo new site jacobmammoliti.github.io && cd jacobmammoliti.github.io

# Initialize directory as a Git repository
git init

# Add a Hugo theme as a submodule
git submodule add https://github.com/monkeyWzr/hugo-theme-cactus.git themes/cactus

# Add the theme to the config file
echo theme = \"cactus\" >> config.toml
```

## Run locally

```bash
hugo server --buildDrafts --bind=0.0.0.0 --baseURL=http://127.0.0.1:1313
```

## Create a new blog post

```bash
hugo new posts/post-title.md
```