# 📦 XPIDER Extension Snapshots

이 폴더는 **읽기 전용 보관함**입니다. 직접 편집하지 마세요.

## 구조
```
_snapshots/
  YYYYMMDD_HHMMSS_[메모]/    ← 각 스냅샷 폴더 (읽기 전용)
    google_maps_extension_source/
    bing_map_source/
    Email_Extractor_Source/
    _meta.json               ← 저장 시각 / 메모 기록
```

## 사용법
- **저장**: "저장해줘" → AI가 save-snapshot.ps1 실행
- **복원**: restore-snapshot.ps1 실행 후 폴더명 입력

> ⚠️ 스냅샷 폴더 내 파일은 모두 읽기 전용으로 잠깁니다.
> 편집하려면 restore-snapshot.ps1로 복원하세요.
