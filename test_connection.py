import os
import asyncio
from telethon import TelegramClient
from dotenv import load_dotenv

load_dotenv()

API_ID = os.getenv('TELEGRAM_API_ID')
API_HASH = os.getenv('TELEGRAM_API_HASH')

async def main():
    if not API_ID or not API_HASH:
        print("Please set TELEGRAM_API_ID and TELEGRAM_API_HASH in .env")
        return

    print("Connecting to Telegram...")
    client = TelegramClient('anon', int(API_ID), API_HASH)
    await client.start()
    
    me = await client.get_me()
    print(f"Successfully connected as {me.first_name} (ID: {me.id})")
    
    await client.disconnect()

if __name__ == '__main__':
    asyncio.run(main())
