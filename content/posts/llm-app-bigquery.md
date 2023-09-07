---
title: "Putting a Large Language Model in Front of my NHL BigQuery Dataset"
date: 2023-09-07T17:25:57-04:00
draft: false
---

The NHL season is just around the corner, and with it comes a fresh year of statistical data and predictions. I've been a dedicated follower of the NHL for quite some time, always aiming to catch a game in any North American city I find myself traveling to. In recent years, I've developed a deep fascination with the statistics associated with the game and the patterns hidden within them. As a result of this passion, I crafted a Python application a few years ago that runs every morning to retrieve the details of each game played the night before, storing this data in BigQuery.

To understand these data patterns and extract meaningful insights, I often found myself crafting lengthy and, at times, intricate SQL queries. This often led to me spending an excessive amount of time scouring various blogs and Stack Overflow threads, hoping to stumble upon an example that somewhat resembled my own problem. Given that I'm far from being an SQL query guru, I needed a solution to this problem, which brings me to the concept of building an application that harnesses the power of language models.

In this post, I’ll walk through my journey of creating a Python application that integrates with a Large Language Model, allowing me to interact with my BigQuery Data via natural language and not having to worry about constructing complex SQL queries. Let’s dive in.

## Building the MVP Solution with LangChain

![llm_chat_bigquery](/images/llm-app-bigquery/llm_app_bigquery.png)

As an initial MVP solution, I wanted the application to just be run directly in a terminal where a user inputs the dataset and their prompt and as a result, the application would summarize its findings.

To do this, I first turned to [LangChain](https://python.langchain.com/docs/get_started/introduction.html). While I recommend delving into their documentation for a formal introduction, let me provide you with a brief overview. LangChain serves as an abstraction layer for Large Language Models (LLMs) from various providers, including OpenAI, Microsoft, Google, and more. What's particularly convenient is that it offers pre-built assembly chains, simplifying the creation of straightforward solutions like the one I created.

After spending some time with the documentation, I realized that employing an SQL agent would perfectly achieve what I’m looking to do. The notable advantage of this agent lies in its ability to handle much of the heavy lifting required for interacting with BigQuery (or any SQL database). This includes understanding the table schemas and also being able to recover from failed queries by learning from mistakes from previous attempts.

## Stepping through the Code

Let’s dive into the solution thus far. If you are interested in seeing the full code, you can find it [here](https://github.com/jacobmammoliti/blog-artifacts/tree/main/llm-bigquery).

The first step was to establish a connection to BigQuery. The `SQLDatabase` class has a method called `from_uri` which takes in the database URI as an input. It uses SQLAlchemy’s `create_engine` method under the hood to connect to the database.

```python
db = SQLDatabase.from_uri(dataset)
```

Next, I needed to define the language model that will be the cornerstone to this solution. After some experimentation, I settled on OpenAI’s GPT-4 model. This choice proved to yield more accurate and consistent results when generating SQL queries. I initially tried using GPT-3.5-turbo, but it consistently produced invalid SQL queries, even after modifying the prompt prefix.

```python
llm = OpenAI(temperature=0, model_name='gpt-4', verbose=verbose)
```

The backbone of this entire application was the SQL agent I mentioned earlier. It takes arguments such as the database connection and the chosen LLM to create the agent that can be used to take natural language prompts, construct an SQL query, and then run it against the database.

```python
agent_executor = create_sql_agent(
  llm=llm,
  toolkit=SQLDatabaseToolkit(db=db, llm=llm),
  verbose=verbose,
  agent_type=AgentType.ZERO_SHOT_REACT_DESCRIPTION
)
```

To wrap it up, we have the final piece of the puzzle - running the query. Since this is just an MVP, I kept it simple by using Python’s `input` function to accept user input. There isn’t any extensive checks or validations to the user input. My focus here was to demonstrate the core functionality of the solution.

```python
output = agent_executor.run(prompt)

print (output)
```

Running the application:

```bash
$ python main.py
Enter the dataset URI: bigquery://proj-puffin-95027/nhl
Enter the prompt: How many total goals did the Toronto Maple Leafs
score in their last 5 games?
Run in verbose mode? False
```

Output:

```text
The Toronto Maple Leafs scored 10 goals in their last 5 games.
```

Absolutely spot on! The model was able to comprehending the prompt, generate the requisite SQL statement, and subsequently deliver the precise result in a natural language sentence. (Just to assure you, I double-checked this – those last 5 games of the Leafs indeed date back to last season when they faced off against the Florida Panthers in that disappointing second playoff round.)

Now, let’s dive a bit deeper and explore some snippets from the outputs when I executed this in verbose mode. This feature was particularly fascinating because it granted a window into the model’s thought process, allowing me to follow the intricate steps it took to arrive at the final output.

In its initial train of thought thought, the model went through the process of determining which table within the BigQuery dataset would be the most appropriate choice. It did this by reading the available table names and then deciding to look at the schema to confirm its suitability.

```text
Thought:The "historical_nhl" table seems to be the most relevant for
this question. I should check its schema to understand what data
it contains.
```

Following this, it ensured that the columns it found are aligned with the user’s provided prompt. It then went through attempting to execute the query against the dataset, addressing any errors that came up along the way.

```text
Thought:The "historical_nhl" table contains the data I need. I can use
the "game_date", "away_team_name", "away_team_score", "home_team_name",
and "home_team_score" columns to find the number of goals scored by the
Toronto Maple Leafs in their last 5 games. I will first check if my
query is correct.
```

As it reached its final thought, the model went into a reflective process, reviewing the results it had extracted from the dataset. From all indications, it seemed confident in the accuracy of the retrieved data and therefore was able to deliver the final calculation and output.

```text
Thought:I have the data for the last 5 games of the Toronto Maple Leafs.
I need to sum the goals scored by the team in these games.
Final Answer: The Toronto Maple Leafs scored 10 goals in their last 5 games.
```

## Final Thoughts and Next Steps

My primary objectives with this project were twofold:

1. To dive deeper into LLMs and gain hands-on experience with LangChain
2. To develop a program that enables me to query my NHL dataset in natural language, thus eliminating the need to write complex SQL statements

I’d say both of these objects were a success. I found it interesting experimenting with various language models, prompts, and temperature settings, and then observing the resulting variations in SQL queries and outputs.

Looking ahead, the focus is on enhancing the user experience and making this more "production" ready. My plan is build a Slack bot around this, allowing me to interact with it for data retrieval through direct messages rather than running it in a terminal. This will make it more accessible to others should I need to extend its usage. I’m excited to embark on this next phase and, once it’s all in place, share the experience and insights in a follow-up blog post.
