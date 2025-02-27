---
title: "Getting Hands-On with Vertex AI Agent"
date: 2025-02-27T12:40:05-05:00
draft: false
---

## Introduction

As I continue to dive deeper in the world of data and machine learning, I'm constantly looking for ways to better visualize and interact with my data. If you've read any of recent blogs, you'll recall I've been working with a series of NHL data that I've been collecting over the years. In this blog, I'll demonstrate how to leverage Vertex AI's agent builder to easily build an agent with optional Large Language Model summarization included. This is similar to the Slack bot I built in my last blog with Python. There are two key differences with this use case. The first is the returning of structured data and speed I get vs. using an LLM. I found the Vertex AI was much faster at returning results in a structured format. The second key difference is the no-code aspect. In the previous blog, I had to write the Python code to interact with Gemini whereas with the agent builder, you can have a question and answer agent up within a matter of clicks, which is great for initial testing and folks who want to get easily get started with LLMs.

## Setting Up

To create a Vertex AI Agent, you can leverage the agent builder by searching for it in the GCP console.

![console](/images/getting-hands-on-with-vertex-ai-agent/console.png)

I created a new application of type "Custom search". This allows me add data from BigQuery which is where all of my NHL data is stored. For simplicity of this application, I turned off "Enterprise edition features" since I know I won't be using any of those features. I left on "Advanced LLM features" since its a good option to have if the end user is still just looking for a summary of the data in addition to receiving it in tabular form. The agent builder requires you to also provide a name, company, and location. In the last section of the setup, I provided the data source which I mentioned will be from BigQuery. I put the synchronization feature to periodic and set the frequency to every day. Its currently a bit restrictive, you can only choose every day, 3 days, or 5 days, but I suspect this will be expanded on in the future. I proceeded to add two of my tables from my NHL data source, the games and team_totals table. All said and done, the application page looked like below prior to creating the application.

![datastores](/images/getting-hands-on-with-vertex-ai-agent/datastores.png)

## Initial Testing

The agent builder provides a convenient way to preview how the agent will retrieve data via the console. This was useful for me to understand how the agent will respond with different searches and to the see the structure of the search results I would get back. Below are some screenshots showing what this looks like.

### The Agent's LLM Response

![llm_response](/images/getting-hands-on-with-vertex-ai-agent/llm_response.png)

### The Agent's Search Results

![search_results](/images/getting-hands-on-with-vertex-ai-agent/search_results.png)

The speed at which these get returned is amazing which is due to Vertex AI doing its own indexing on the data source in order to speed up data retrieval. I've found the generative AI responses to be less helpful right now, especially compared to the solution I built in a previous blog, but I'm not expecting to use this much currently. The goal here is to return tabular data quickly and test out building an agent without code.

## Tweaks and Configurations

The agent builder also comes with a full suite of available configurations in an attempt to improve how the agent responds via tuning, LLM model selection, prompt customization for the model, etc. I found this particularly useful when adjusting how I wanted Gemini to present the summary of the search results.

## Building a Basic Front End

Once I was happy with what the agent builder was returning, I wanted to put together a simple front-end in front of this agent for actual consumption. While the no-code component to set this up was great, there will likely always be some matter of code required to bring this from a testing environment to be consumed by real tenants.

When it comes to integration, the agent builder provides two options: widget or API. I ended up using the API method since I wanted a bit more control on how the search bar looks and is interacted with.

To build the front end, I went with using Flask and the requests library to interact with the agent's API. Google does provide a full solution [here](https://cloud.google.com/generative-ai-app-builder/docs/answer#search-answer-basic-python) using native libraries but because this is classified as a blended search app (an app that has more than one data store), Google, at the time of this writing, needs to add this project to a specific allowlist.

You can view the source code [here](https://github.com/jacobmammoliti/blog-artifacts/tree/main/vertexai-agent). Below is what the application looks like deployed and being used.

![frontend_app](/images/getting-hands-on-with-vertex-ai-agent/frontend_app.png)

## Wrapping Up

This was my first time being hands-on with a no-code tool like the Vertex AI Agent Builder. Its quite fascinating to how easy it is now for folks, whether they are in a deep technical role or not, to spin up a chat-like bot to interact with their data so quickly. The speed at which the data is able to get returned is super fascinating to me and I can see many areas where a solution like this can be leveraged, similar to the Slack bot I wrote a few months back that leveraged Gemini to build the SQL queries from natural language. I'm interested how Google continues to expand on this and to see how others are using this builder to get more meaningful insights into their data.