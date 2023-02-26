# Datasets
This folder will contain all datasets used to fine-tune the GPT-3 models, for **generating suggestions** and coming up with **search queries**.

## How do I create my own dataset?
Firstly, you'll have to enable `collectMessages` in the `config.json` file and create the `messages` database as described in `docs/database.md`.

This will be used to store all user interactions. Then, you can regularly check the dataset size using `/dataset view` on Discord.

Once you think that it reached a good enough size, you can export it to this folder using `/dataset export`.

## Cleaning up
You will most likely have to clean up the exported datasets, due to testing the bot or spammy messages from users.

## Fine-tuning
Once you exported a large enough dataset, you can head over to the [**Fine-tuning**](https://platform.openai.com/docs/guides/fine-tuning) page on OpenAI. The exported datasets are already formatted accordingly, so you don't have to run the preparation tool.