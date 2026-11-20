# Research Studio — GitHub Pages + Supabase + Gemini

## 구성
- `docs/`: GitHub Pages 정적 웹앱 (프로젝트 / 논문 분석 / 논문 독해 카드 / 생태계 지도 / 내보내기)
- `supabase/schema.sql`: 사용자별 프로젝트 저장과 RLS 및 일일 AI 호출 제한
- `supabase/functions/analyze/index.ts`: 로그인 JWT 검증 후 Gemini API 호출
- `supabase/config.toml`: Supabase JWT gateway 검사 비활성화 (함수 내부에서 JWT를 검증함)

## 1. Supabase 설정
1. https://supabase.com/dashboard 에서 프로젝트를 생성.
2. SQL Editor에서 `supabase/schema.sql` 전체 실행.
3. Authentication > Providers에서 Email 활성화. 이메일 확인 여부를 점검하고 Authentication > URL Configuration에 배포된 GitHub Pages 주소를 `Site URL`/`Redirect URLs`에 추가. 비밀번호 재설정 링크에도 필요.
4. Project Settings > API Keys에서 **Project URL** 및 **publishable key** 확인. `docs/config.js`에 두 값 입력.
5. **service_role 키와 Gemini API 키는 docs 폴더에 절대 넣지 않기.**

## 2. Gemini API 키를 Supabase 함수 비밀값으로 저장
- https://aistudio.google.com/apikey 에서 Gemini API 키 발급.
- Supabase Dashboard > Edge Functions > Secrets 에 `GEMINI_API_KEY` 등록. 또는 Supabase CLI에서 아래 실행.

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase secrets set GEMINI_API_KEY=YOUR_GEMINI_API_KEY
npx supabase functions deploy analyze --no-verify-jwt
```

- `--no-verify-jwt`는 **인증을 건너뛴다는 뜻이 아님**. 함수 코드 내부에서 `auth.getUser(token)`으로 사용자를 검증함. 단, 무조건적으로 비활성화하는 다른 함수에는 적용하지 말 것.
- 현재 Supabase 제공 환경변수 `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`를 사용함. 새 키 체계에서 이 값이 제공되지 않는 프로젝트는 별도 비밀변수에 같은 이름으로 설정하고 배포해야 함.
- `supabase/config.toml` 경로에서 CLI 명령을 실행해야 설정을 자동 적용함.

## 3. GitHub Pages 배포
1. GitHub에 새 저장소 생성. 이 폴더 내용을 업로드하되 `.env`, 비밀번호, Gemini API 키 등을 업로드하지 말 것.
2. Settings > Pages > Build and deployment > Deploy from a branch > `main` / `/docs` 선택.
3. 배포 주소: `https://YOUR_GITHUB_NAME.github.io/YOUR_REPOSITORY/`.
4. 해당 주소로 회원가입 → 메일 인증 → 로그인 → PDF 분석 테스트.

## 운영 참고
- 사용자별 프로젝트는 `research_projects.data` JSONB에 저장, **PDF 원본은 서버에 저장하지 않음**. 대신 발췌한 원문 청크와 AI 독해 결과는 데이터베이스에 저장됨.
- 사용자의 전체 PDF 텍스트는 브라우저 메모리에만 남으며, 로그아웃/새로고침 후 다시 올려야 독해 카드를 재생성할 수 있음.
- `research_projects` RLS로 사용자 간 열람을 차단. 가입은 기본적으로 개방되어 있으므로 동기 계정 생성 후 Supabase Authentication에서 신규 가입을 끄거나 초대 기반으로 운영할 것.
- 1인당 하루 15번(UTC 기준) AI 호출로 제한. 모든 사용자의 Gemini 프로젝트 무료 한도는 **공유**하므로 초과시 호출 실패할 수 있음.
- 호출 예약 이후 Gemini 호출이 실패하더라도 일일 호출 횟수는 소모됨(오남용 방지).
- GitHub Pages는 공개 정적 페이지임. **접속 페이지 자체가 비공개는 아니지만 연구 데이터와 AI 호출은 로그인으로 보호됨.**
- 스캔형 PDF OCR 미지원, 키워드 기반 청크 선별은 누락 가능, 독해 카드 원문 검증 필수.
- `docs/config.js`에는 공개 설정값만, `supabase/functions`에는 공개해도 되는 서버 소스코드만 둠. 실제 비밀값은 Supabase Secrets에만 보관.
