// 배포 후 채워 넣으세요. (API 키 같은 비밀값은 절대 여기에 넣지 않습니다)
export const CONFIG = {
  // GAS "웹 앱으로 배포" 후 받은 URL (https://script.google.com/macros/s/…/exec)
  GAS_URL: 'https://script.google.com/macros/s/AKfycbyiXjee90x6tcSQrmT36mtuco5BsTQ5FdO-iuBr3miGv3RFLcdn461RTM4yEY4WV0iR/exec',
  // Google Cloud Console에서 만든 OAuth 2.0 웹 클라이언트 ID (…apps.googleusercontent.com)
  GOOGLE_CLIENT_ID: '',
};

// GAS_URL이 비어 있으면 브라우저 안에서만 동작하는 미리보기 모드(가짜 데이터)로 실행됩니다.
export const PREVIEW_MODE = !CONFIG.GAS_URL;
