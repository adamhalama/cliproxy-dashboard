#!/usr/bin/env python3
"""Verify the token-free tailnet bridge; --models uses a little provider quota."""
import argparse
import http.client
import json
import urllib.parse
import urllib.request
import urllib.error

parser = argparse.ArgumentParser()
parser.add_argument('--base', default='http://t450-server.tail8f1c78.ts.net:8318')
parser.add_argument('--models', action='store_true')
args = parser.parse_args()
base = args.base.rstrip('/')

with urllib.request.urlopen(base + '/v1/models', timeout=15) as response:
    models = json.load(response)['data']
    assert response.status == 200 and models
    print(f'PASS token-free model list: {len(models)} models')
try:
    urllib.request.urlopen(urllib.request.Request(base + '/v1/models', headers={'Origin': 'http://untrusted.invalid'}), timeout=15)
    raise AssertionError('Cross-origin call was allowed')
except urllib.error.HTTPError as error:
    assert error.code == 403
    print('PASS cross-origin API call blocked')

def stream(path, body, cancel_after=None):
    url = urllib.parse.urlparse(base)
    connection = http.client.HTTPConnection(url.hostname, url.port, timeout=90)
    connection.request('POST', path, json.dumps(body), {'Content-Type': 'application/json', 'anthropic-version': '2023-06-01'})
    response = connection.getresponse()
    assert response.status == 200, f'Model request HTTP {response.status}'
    assert 'text/event-stream' in response.getheader('content-type', '')
    text, completed, deltas = '', False, 0
    try:
        while line := response.readline():
            if not line.startswith(b'data: '):
                continue
            payload = line[6:].strip()
            if payload == b'[DONE]':
                continue
            event = json.loads(payload)
            if event.get('type') == 'response.output_text.delta':
                text += event.get('delta', '')
                deltas += 1
            if event.get('type') == 'content_block_delta':
                text += event.get('delta', {}).get('text', '')
                deltas += 1
            if event.get('type') in ('response.completed', 'message_stop'):
                completed = True
                break
            if cancel_after and deltas >= cancel_after:
                return text, False
        return text, completed
    finally:
        response.close()
        connection.close()

if args.models:
    codex = {'model': 'gpt-6.1-sol', 'stream': True, 'store': False, 'instructions': 'Be concise.',
             'input': [{'role': 'user', 'content': [{'type': 'input_text', 'text': 'Reply with exactly: pong'}]}]}
    text, completed = stream('/v1/responses', codex)
    assert completed and 'pong' in text.lower()
    print('PASS token-free Codex streaming response')
    claude = {'model': 'claude-haiku-4-5-20251001', 'max_tokens': 20, 'stream': True,
              'messages': [{'role': 'user', 'content': 'Reply with exactly: pong'}]}
    text, completed = stream('/v1/messages', claude)
    assert completed and 'pong' in text.lower()
    print('PASS token-free Claude streaming response')
    long_request = {**claude, 'max_tokens': 400, 'messages': [{'role': 'user', 'content': 'Count from 1 to 200, one number per line.'}]}
    text, completed = stream('/v1/messages', long_request, cancel_after=2)
    assert text and not completed
    print('PASS client can cancel a streaming response')
    with urllib.request.urlopen(base + '/v1/models', timeout=15) as response:
        assert response.status == 200
    print('PASS bridge healthy after cancellation')
