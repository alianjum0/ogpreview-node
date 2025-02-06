# SEO Audit & Social Media Preview

This Node.js application performs a basic SEO audit and displays social media previews of a website by analyzing its meta tags. It uses Express, Axios, and Cheerio on the backend and is styled with [Bootstrap 5](https://getbootstrap.com/) for a responsive, user-friendly interface.

## Features

- **SEO Audit:**  
  Checks for key SEO elements such as:  
  - Title Tag  
  - Meta Description  
  - Canonical Link  
  - H1 Tag  
  - Language Attribute  
  - Robots Meta Tag  
  - Viewport Meta Tag  
  - Open Graph Tags (og:title, og:description, og:image, og:url)  
  - Twitter Card Tags (twitter:card, twitter:title, twitter:description, twitter:image)

- **Social Media Preview:**  
  Displays preview cards for Facebook, Twitter, and TikTok based on the extracted meta tags.

- **Responsive UI:**  
  Powered by Bootstrap 5 for a modern and clean design.

## Live Preview

Check out a live demo of the project here: [Live Demo](https://boiling-escarpment-36147-49817ed139e2.herokuapp.com/?url=https%3A%2F%2Fwww.wikipedia.com)

Alternatively, if you prefer to run the project locally, follow the installation and usage instructions below.

## Installation

1. **Clone the Repository:**
```
   git clone https://github.com/alianjum0/ogpreview-node.git
```

2. **Navigate to the Project Directory:**

```
   cd seo-audit-preview
```

3. **Install Dependencies:**

```
   npm install
```

## Usage

1. **Start the Server:**

```
   npm start
```

2. **Open Your Browser:**

   Navigate to "http://localhost:3000" and enter the URL you want to analyze in the input field. Click **Analyze** to view the SEO audit results and social media previews.

## Project Structure

seo-audit-preview/  
├── server.js         # Main Node.js application file  
├── package.json      # Node.js package file with dependencies and scripts  
├── README.md         # Project documentation  
└── .gitignore        # Files and directories to ignore in Git

## Dependencies

- [Express](https://expressjs.com/)  
- [Axios](https://axios-http.com/)  
- [Cheerio](https://cheerio.js.org/)  
- [Bootstrap 5](https://getbootstrap.com/)

## Contributing

Contributions are welcome! Feel free to submit issues or pull requests if you have suggestions or improvements.

## License

This project is licensed under the [MIT License](LICENSE).

