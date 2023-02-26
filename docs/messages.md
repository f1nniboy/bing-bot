# Saving messages to the database
You can gather data for fine-tuning by collecting user's messages **anonymously** in the database.

## Creating the table
Create the `messages` table in Supabase, as shown in `database.md`.

## Enabling the option
Set `collectMessages` to **`true`** in the configuration file.

---

## TODO
- Add tool for exporting collected data to JSONL files