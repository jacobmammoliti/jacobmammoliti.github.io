---
title: "Querying BigQuery Data with Natural Language with Gemini and LangChain"
date: 2024-09-24T20:33:52-04:00
draft: false
---

## Introduction

In a previous blog, I developed a Python application that leveraged OpenAI’s GPT-4 model and LangChain’s SQL agent to query NHL data stored in BigQuery through natural language prompts. At the end of that blog, I mentioned my intention to re-write the application as a Slack application to provide a more accessible way to interact with the data.

The Slack application I developed now runs in Cloud Run and leverages Gemini to generate potentially complex SQL queries from English questions that are provided by the user.

In this blog, I’ll walk through the solution. If you’re interested in seeing all the code behind the project, the GitHub repository is available [here](https://github.com/jacobmammoliti/blog-artifacts/llm-gemini-bigquery).

## Motivation

SQL is used daily by data scientists, database administrators, and many others. Whether you fit into one of these roles or not, complex queries demand a strong grasp of SQL syntax and a deep understanding of database schemas. The goal of this project was to simplify my interaction with data—eliminating the need to craft intricate queries and instead allowing me to engage with my data in a more natural, conversational manner.

This type of application can be extended to the likes of broadcasters who need to get the exact stat their looking for quickly while on air or sports writers who need a few statistics for their upcoming article and do not want to dig through multiple lines of game logs.

## Architecture

The diagram below illustrates the application's current flow. A user interacts with the Slack application by posing a question about NHL data. The application utilizes Slack's Bolt library and the LangChain library. Within LangChain, we employ the SQL agent in conjunction with Gemini's Flash 1.5 LLM to generate SQL queries based on the user's natural language prompt and the BigQuery dataset.

By leveraging the SQL Agent, we gain a richer and more flexible way to interact with BigQuery. Key advantages of the agent include its ability to recover from errors—catching mistakes in generated queries and regenerating them—and its capacity to query the database multiple times as needed to fully answer the user's question.

![gemini_architecture](/images/llm-app-gemini-bigquery/slack_gemini.png)

As a Slack application, it needs to run continuously. I chose to deploy it on Cloud Run. The application's container image is stored in Artifact Registry and automatically built and pushed via GitHub Actions. For those interested in the infrastructure setup, the Terraform code used to deploy the application will be available in the GitHub repository.

## Slack Application Code

The application leverages two key frameworks: Bolt and LangChain.

Bolt is a framework for building Slack applications. It enables developers to create apps that respond to events and messages in a Slack workspace by registering them using Python decorators. In the example below, I've defined a function that triggers whenever the application is mentioned by a user.

When a user mentions the application, it generates and sends a payload to the app. This payload contains the message text and other metadata. We extract the text—which represents the user's question—and pass it as input to the SQL agent. The agent then processes the query and returns a response in the form of a dictionary containing the answer. Here's a code snippet demonstrating the function definition:

```python
@app.event("app_mention")
def mention_handler(body: dict, say: Callable):
  question = body['event']['blocks'][0]['elements'][0]['elements'][1]['text']
    
  # Send question to SQL agent
  response = agent_executer.invoke(question)

  say(response['output'])
```

---

LangChain is a framework for developing applications powered by Large Language Models (LLMs). It offers a variety of pre-built [agents](https://python.langchain.com/v0.1/docs/modules/agents/) and functions, providing a consistent experience across multiple LLMs. In this application, I'm using the ChatVertexAI chat model alongside the SQL agent to interact with BigQuery and generate SQL queries from natural language input. Here's a code snippet demonstrating this implementation:

```python
db = SQLDatabase.from_uri(database_uri)
llm = ChatVertexAI(model=llm_model)

agent_executer = create_sql_agent(
    llm=llm,
    db=db,
    verbose=verbose_mode,
    agent_type="zero-shot-react-description",
)
```

For the full application code, you can refer to the GitHub repository linked earlier.

## Examples

During testing, I focused on verifying the application's ability to perform basic retrievals. The app successfully executed simple queries when asked about specific players in particular seasons. Additionally, it demonstrated the capability to perform basic data ranking. Below is a screenshot showcasing a few sample interactions:

![initial_conversation](/images/llm-app-gemini-bigquery/conversation_01.png)

## Learning Lessons and Improvements

### Data Accuracy and Hallucinations

So far, the application has provided accurate results. It also recognizes when it can't find an answer and clearly communicates this in its response. I tested this by asking for a player statistic that I know isn't tracked. To the application's credit, it simply responded with a message stating it didn't know, rather than fabricating an answer.

There was also an instance where the application failed to understand the question. Below is an example closely related to the scenario I mentioned earlier.

![second_conversation](/images/llm-app-gemini-bigquery/conversation_02.png)

### SQL Agent Verbosity

You may have noticed a `verbose` argument in the `create_sql_agent` function above. One fascinating aspect of the SQL agent is its ability to reveal its thought process as it deconstructs the prompt, reads the database schema, the actual data, and determines the optimal query to answer the question. Here's a peek into those logs:

```python
> Entering new SQL Agent Executor chain...
Thought: I should look at the tables in the database to see what I can query.
Then I should query the schema of the most relevant tables.
Action: sql_db_list_tables

...
Thought: I can query the `nhl_players_2022` table to find the number of goals 
scored by Auston Matthews.
...
```

As a future state, I’d like to get these thoughts posted as a thread in Slack so the user has some insights into how the agent got to its answer.

### Permission Considerations

When using an SQL agent with LangChain, it's crucial to manage permissions carefully to ensure secure and authorized database access. The SQL agent executes queries based on user input, so permissions must be set to restrict actions like data modification or sensitive data retrieval. For agents interacting with production databases, it's recommended to use read-only permissions. This ensures they can query data without making changes.

## Conclusion

Building this Slack application has taught me a lot about Gemini and the LangChain SQL agent. It’s fascinating to see how it processes data retrieval based on user input. Within minutes of using it in its basic form, I can already see potential use cases in the sports world. Whether it’s used by announcers or talk show hosts to quickly retrieve specific stats, or by team personnel to gain deep insights into players without constructing SQL queries, the possibilities are vast.

As I continue developing this application, I’m excited to push the limits of the Gemini models and explore deeper insights from the data while also improving the overall user experience.
