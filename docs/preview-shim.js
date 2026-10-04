/* 둘러보기용 껍데기.
   앱 화면은 원래 자기 서버(app/server.mjs)에 /api/... 로 물어보며 돈다.
   여기는 파일만 내려주는 곳이라 서버가 없으므로, 그 물음을 가로채 미리 만들어 둔
   답을 돌려준다. 앱 코드는 한 줄도 고치지 않는다.

   되는 것: 설정, 입력, 미리 만들어 둔 예시 불러오기.
   안 되는 것: AI 로 새로 만들기, 파일 올리기, 기존 PPTX 읽기. 서버가 있어야 한다. */
(function () {
  const REAL = window.fetch.bind(window);
  const BASE = new URL('.', location.href).href;   // 이 페이지가 놓인 곳
  const REPO = 'https://github.com/hy0909/ppt-maker';
  const RAW  = 'https://github.com/hy0909/ppt-maker/raw/main/examples/breezehome/out';
  const DEMO = 'breezehome';
  /* 장표 디자인 값. 사본을 두면 엇갈리므로 저장소의 원본을 그대로 읽는다. */
  const TOKENS = 'https://raw.githubusercontent.com/hy0909/ppt-maker/main/skills/ppt-maker/design-tokens.json';

  const at = p => new URL(p, BASE).href;
  const ok = body => new Response(
    typeof body === 'string' ? body : JSON.stringify(body),
    { status: 200, headers: { 'Content-Type': typeof body === 'string'
        ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8' } });

  /* 서버가 없어서 못 하는 일. 앱은 응답의 error 를 화면에 띄운다. */
  const nope = what => ok({
    error: what + ' 둘러보기 화면에서는 안 됩니다. 뒤에서 일할 서버가 없습니다.\n\n'
         + '내 컴퓨터에서 켜면 Claude 나 GPT 중 아무거나 붙여 쓸 수 있습니다.\n'
         + '연결 방법: ' + new URL('setup/', BASE).href + '\n'
         + '내려받기: ' + REPO + '\n\n'
         + '키 없이 쓰려면 아래 «프롬프트 복사» 로 프롬프트를 가져가\n'
         + '쓰던 AI 에 붙여 넣고, 받은 JSON 을 «JSON 붙여넣기» 로 가져오세요.',
    state: 'error', done: true,
  });

  let cached = null;
  async function outline() {
    if (!cached) cached = await (await REAL(at('data/outline.json'))).json();
    return JSON.parse(JSON.stringify(cached));
  }

  /* 미리 만들어 둔 결과를 가리킨다. 새로 만들지 않는다. */
  const built = () => ({
    ok: true, built: true, overflow: false, fileBase: 'breezehome_260921',
    log: '미리 만들어 둔 예시를 보여 줍니다. 새로 만들려면 내 컴퓨터에서 켜세요.',
    preview: at('demo/'), pdf: RAW + '/deck.pdf', pptx: RAW + '/deck.pptx', fit: {},
  });

  window.fetch = async function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url ?? '';
    if (!/(^|\/)api\//.test(url)) return REAL(...args);

    const u = new URL(url, location.href);
    const p = u.pathname.replace(/^.*?(\/api\/)/, '$1');   // 어느 폴더에 올라가도 맞게

    if (p === '/api/status')    return ok({ hasCreds: false, backend: 'none',
                                            projects: [{ name: DEMO, built: true }] });
    if (p === '/api/projects')  return ok({ projects: [{ name: DEMO, built: true }] });
    // no-cache: 목록이나 값이 바뀌었는데 브라우저가 옛 파일을 들고 있는 일을 막는다
    if (p === '/api/coverspec') return REAL(at('coverspec.json'), { cache: 'no-cache' });
    if (p === '/api/tokens')    return REAL(TOKENS, { cache: 'no-cache' });
    if (p === '/api/prompt')    return REAL(at('prompt.txt'));

    if (p === '/api/estimate') {
      /* app/server.mjs 의 어림셈과 같은 식이다. */
      const chars = Number(u.searchParams.get('chars') || 0);
      const inTok = Math.round(chars / 2.2) + 8500;
      const outTok = Math.min(16000, Math.max(5000, 4000 + chars * 2));
      return ok({ inputTokens: inTok, outputTokens: outTok,
                  seconds: Math.round(outTok / 80 + 15), basis: '어림값' });
    }

    if (p.startsWith('/api/project/')) {
      return ok({ project: DEMO, outline: await outline(), ...built() });
    }
    if (p === '/api/build') {
      return ok(built());
    }

    if (p === '/api/outline/start' || p === '/api/outline/status') return nope('AI 로 장표를 짜는 일은');
    if (p === '/api/outline/cancel') return ok({ state: 'cancelled' });
    if (p === '/api/extract') return nope('기존 PPTX 를 읽는 일은');
    if (p === '/api/asset')   return nope('그림 파일을 올리는 일은');

    return nope('이 기능은');
  };
})();
