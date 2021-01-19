import { Telegraf } from "telegraf";
import { initDb, query } from "./db.js";
import dotenv from "dotenv";
import axios from "axios";
import dayjs from "dayjs";

dotenv.config();

const checkInterval = 15 * 1000 * 60; // 15 minutes
let LAST_UPDATE = Date.now();
let MESSAGES_QUEUE = [];
let USERS = [];

await initDb();
/* Get last update date */
const updateResult = await query(`SELECT last_update from update`);
if (updateResult.rows[0]?.last_update) {
  LAST_UPDATE = dayjs(updateResult.rows[0].last_update).toISOString();
}
/* Get registered users */
const usersResult = await query(`SELECT chat_id from users`);
if (usersResult.rows) {
  USERS = usersResult.rows;
}

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.start(async (ctx) => {
  ctx.reply(
    `Hi there!\nDon't hesitate to start receiving last updates from bips.xyz by typing the following command:\n/startupdates`
  );
  ctx.reply(`For more commands, run /help`);
});

bot.command("startupdates", async (ctx) => {
  const userResult = await query(
    `SELECT chat_id FROM users where chat_id = $1`,
    [ctx.chat.id]
  );

  if (userResult.rows[0]?.chat_id === ctx.chat.id) {
    ctx.reply("You are already registered 💕");
  } else {
    await query(`INSERT INTO users(chat_id) VALUES($1)`, [ctx.chat.id]);
    USERS = [...USERS, { chat_id: ctx.chat.id }];
    ctx.reply("Welcome 🥳🎉");
  }
});

bot.command("stopupdates", async (ctx) => {
  const userResult = await query(
    `SELECT chat_id FROM users where chat_id = $1`,
    [ctx.chat.id]
  );

  if (userResult.rows.length === 0) {
    ctx.reply(
      "You are not registered. Are you sure you don't want to register?\n/startupdates"
    );
  } else {
    await query(`DELETE FROM users WHERE chat_id = $1;`, [ctx.chat.id]);
    USERS = [...USERS.filter((user) => user.chat_id !== ctx.chat.id)];
    ctx.reply("No problem, I will no longer send you notifications. 😭");
  }
});
bot.help((ctx) => ctx.reply("Send me a sticker"));
bot.launch();

/* CREATE QUEUE */
let isFetching = false;
setInterval(async () => {
  // Fetch only if the currentQueue is empty
  if (MESSAGES_QUEUE.length === 0) {
    isFetching = true;

    try {
      const result = await axios.get(
        `https://bips.xyz/api/bips1?lastUpdate=${LAST_UPDATE}`
      );
      const bips = result.data;

      let lastUpdateMax = null;
      for (const bip of bips) {
        if (!lastUpdateMax) {
          lastUpdateMax = bip.LastUpdate;
        }
        if (bip.LastUpdate > lastUpdateMax) {
          lastUpdateMax = bip.LastUpdate;
        }

        /* Update lastupdate date */
        await query(`UPDATE update SET last_update=$1`, [lastUpdateMax]);
        LAST_UPDATE = lastUpdateMax;

        /* Send messages */
        for (const user of USERS) {
          MESSAGES_QUEUE = [...MESSAGES_QUEUE, { chatId: user.chat_id, bip }];
        }
      }
    } catch (error) {
      console.error("Error while fetching/sending messages", error);
    }

    isFetching = false;
  }
}, checkInterval);

/* MESSAGES SENDING */
let isSendingMessages = false;
setInterval(async () => {
  // Send messages only if we are not currently fetching data and if we are not currently sending messages
  if (!isFetching && !isSendingMessages && MESSAGES_QUEUE.length > 0) {
    isSendingMessages = true;
    for (const message of MESSAGES_QUEUE) {
      // Send one message per second (telegram limits)
      await delay(sendMessage, message.chatId, message.bip);
    }
    isSendingMessages = false;
    MESSAGES_QUEUE = [];
  }
}, checkInterval / 2);

const sendMessage = async (user, bip) => {
  return await bot.telegram.sendMessage(
    user,
    `BIP ${bip.Number} has been updated on https://bips.xyz/${bip.Number}`
  );
};

const delay = (fn, user, bip) => {
  return new Promise((resolve) => {
    // wait 1s before calling fn(par)
    setTimeout(() => resolve(fn(user, bip)), 1000);
  });
};

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
