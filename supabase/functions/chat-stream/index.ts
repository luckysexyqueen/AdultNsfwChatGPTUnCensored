import requests
import json
import os

url = "https://openrouter.ai/api/v1/chat/completions"
headers = {
    "Authorization": f"Bearer {os.environ.get('OPENROUTER_API_KEY')}",
    "Content-Type": "application/json"
}
payload = {
"model": "@preset/open-ai-gpt-oss-20b-free-uncensored",
"messages": [
{
  "role": "user",
  "content": "Hello! How are you today?"
}
]
}

response = requests.post(url, headers=headers, json=payload)
print(response.json())
