// Vercel CLI는 os.hostname()을 HTTP 헤더에 넣어, 한글 PC 이름이면 ByteString 오류가 난다.
// NODE_OPTIONS=--require 로 미리 로드해 ASCII 호스트명으로 고정한다.
const os = require('os')
os.hostname = () => 'desktop-dev'
