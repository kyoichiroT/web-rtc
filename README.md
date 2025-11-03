# WebRTC ビデオ通話アプリ

TypeScript、Hono、ReactでシンプルなWebRTCビデオ通話アプリケーション。

## 特徴

- **合言葉ベースの接続**: 同じ合言葉を入力したユーザー同士が通話できます
- **複数人通話対応**: 複数のユーザーが同時に通話可能
- **シンプルなUI**: 合言葉入力と通話ボタンだけのミニマルなインターフェース
- **WebSocket signaling**: リアルタイム通信のためのWebSocketベースのシグナリング

## 技術スタック

- **バックエンド**: Hono + Node.js + WebSocket
- **フロントエンド**: React + TypeScript + Vite
- **通信**: WebRTC + WebSocket (シグナリング)

## セットアップ

### 前提条件

- Node.js 18以上
- npm

### バックエンドのセットアップ

```bash
cd backend
npm install
npm run dev
```

バックエンドは `http://localhost:3001` で起動します。

### フロントエンドのセットアップ

```bash
cd frontend
npm install
npm run dev
```

フロントエンドは `http://localhost:5173` で起動します。

## 使い方

1. バックエンドとフロントエンドの両方を起動
2. ブラウザで `http://localhost:5173` を開く
3. 合言葉を入力（例: "test123"）
4. 「通話開始」ボタンをクリック
5. カメラとマイクへのアクセスを許可
6. 別のブラウザまたはタブで同じ手順を実行し、同じ合言葉を入力
7. 接続が確立され、相手のビデオが表示されます

## アーキテクチャ

```
┌──────────────┐                    ┌──────────────┐
│   Browser 1  │                    │   Browser 2  │
│   (React)    │                    │   (React)    │
└──────┬───────┘                    └──────┬───────┘
       │                                   │
       │        WebSocket (Signaling)      │
       │                                   │
       └───────────┬───────────────────────┘
                   │
           ┌───────▼────────┐
           │  Hono Server   │
           │  (WebSocket)   │
           └────────────────┘
```

- フロントエンドがWebSocketでシグナリングサーバーに接続
- offer/answer/ICE candidateのやり取りをWebSocket経由で実行
- WebRTC接続が確立されたら、P2Pでビデオ・オーディオをストリーミング

## 主要なファイル

- `backend/src/index.ts` - Honoサーバーとシグナリングロジック
- `frontend/src/App.tsx` - React UIとWebRTCクライアント実装

## 注意事項

- これは開発用の最小実装です
- プロダクション環境では、HTTPS/WSSを使用してください
- セキュリティやスケーラビリティは考慮されていません
- 合言葉の暗号化は実装されていません