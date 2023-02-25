# Setting up Supabase
The **Supabase** database stores information about command cool-downs and conversation information.

## Creating the tables
You'll have to create the following tables in your **Supabase** database, for the bot to function properly.

### `cooldown` table
![IMG](https://cdn.discordapp.com/attachments/1064234084613771376/1079167994560786572/gpnyWQ7.png)

### `conversations` table
![IMG](https://cdn.discordapp.com/attachments/1064234084613771376/1079167994825019473/TNuHBzT.png)

## Modifying the configuration
When you're done with creating the tables, copy the **Project URL** and **`anon` Project API key** from your database settings and add them to the configuration.