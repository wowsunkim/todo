import Anthropic from '@anthropic-ai/sdk';
import express from 'express';
import { readFileSync } from 'fs';

const app = express();
app.use(express.json());
app.use(express.static('.'));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-6';

// Natural language todo parsing
app.post('/api/parse', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: `다음 자연어 입력을 할 일로 파싱해줘. JSON으로만 응답해 (설명 없이):
{"text": "할 일 제목", "priority": "high|mid|low"}

우선순위 기준:
- high: 마감, 긴급, 오늘, 내일, 보고, 제출, 발표
- mid: 이번 주, 회의, 준비, 검토
- low: 나중에, 언젠가, 여유, 취미

입력: "${text}"`
    }]
  });

  try {
    const json = JSON.parse(msg.content[0].text.trim());
    res.json(json);
  } catch {
    res.json({ text, priority: 'mid' });
  }
});

// Task decomposition into subtasks
app.post('/api/decompose', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `다음 할 일을 구체적인 하위 작업으로 분해해줘. JSON 배열로만 응답해 (설명 없이):
[{"text": "하위 작업 제목", "priority": "high|mid|low"}, ...]

3~5개의 실행 가능한 구체적 단계로 나눠줘.

할 일: "${text}"`
    }]
  });

  try {
    const raw = msg.content[0].text.trim();
    const jsonStr = raw.match(/\[[\s\S]*\]/)?.[0] || raw;
    const json = JSON.parse(jsonStr);
    res.json({ subtasks: json });
  } catch {
    res.json({ subtasks: [{ text, priority: 'mid' }] });
  }
});

// Smart priority suggestions
app.post('/api/suggest', async (req, res) => {
  const { todos } = req.body;
  if (!todos?.length) return res.status(400).json({ error: 'todos required' });

  const list = todos.map(t => `- [${t.id}] "${t.text}" (현재: ${t.priority})`).join('\n');

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `다음 할 일 목록의 우선순위를 분석하고 재조정을 제안해줘. JSON으로만 응답해:
{"suggestions": [{"id": 숫자, "priority": "high|mid|low", "reason": "짧은 이유"}], "summary": "전체 요약 한 줄"}

할 일 목록:
${list}`
    }]
  });

  try {
    const raw = msg.content[0].text.trim();
    const jsonStr = raw.match(/\{[\s\S]*\}/)?.[0] || raw;
    res.json(JSON.parse(jsonStr));
  } catch {
    res.json({ suggestions: [], summary: '분석 중 오류가 발생했습니다.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`서버 실행 중: http://localhost:${PORT}`));
