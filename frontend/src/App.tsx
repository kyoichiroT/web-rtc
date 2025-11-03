import { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'

const WS_URL = 'ws://localhost:3001/signal';
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

interface PeerConnection {
  connection: RTCPeerConnection;
  stream?: MediaStream;
}

function App() {
  const [passphrase, setPassphrase] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [peers, setPeers] = useState<Map<string, PeerConnection>>(new Map());
  
  const wsRef = useRef<WebSocket | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const myIdRef = useRef<string>(Math.random().toString(36).substring(7));
  const peersRef = useRef<Map<string, PeerConnection>>(new Map());

  useEffect(() => {
    peersRef.current = peers;
  }, [peers]);

  const createPeerConnection = async (peerId: string, isInitiator: boolean) => {
    const peerConnection = new RTCPeerConnection(ICE_SERVERS);
    
    // Add local stream tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStreamRef.current!);
      });
    }

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'ice-candidate',
          targetId: peerId,
          candidate: event.candidate,
        }));
      }
    };

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      console.log('Received remote track from', peerId);
      const remoteStream = event.streams[0];
      
      setPeers(prev => {
        const newPeers = new Map(prev);
        const peer = newPeers.get(peerId);
        if (peer) {
          peer.stream = remoteStream;
          newPeers.set(peerId, peer);
        }
        return newPeers;
      });
    };

    peerConnection.onconnectionstatechange = () => {
      console.log('Connection state:', peerConnection.connectionState, 'for peer', peerId);
    };

    const newPeer: PeerConnection = { connection: peerConnection };
    setPeers(prev => new Map(prev).set(peerId, newPeer));
    peersRef.current.set(peerId, newPeer);

    // If initiator, create and send offer
    if (isInitiator) {
      try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'offer',
            targetId: peerId,
            offer: peerConnection.localDescription,
          }));
        }
      } catch (error) {
        console.error('Error creating offer:', error);
      }
    }

    return peerConnection;
  };

  const handleCall = async () => {
    if (!passphrase.trim()) {
      alert('合言葉を入力してください');
      return;
    }

    try {
      // Get local media stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      
      localStreamRef.current = stream;
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Connect to signaling server
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        
        // Join room with passphrase
        ws.send(JSON.stringify({
          type: 'join',
          room: passphrase,
          id: myIdRef.current,
        }));
      };

      ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        console.log('Received message:', data.type);

        switch (data.type) {
          case 'room-users':
            // Create peer connections for existing users
            for (const userId of data.users) {
              await createPeerConnection(userId, true);
            }
            break;

          case 'user-joined':
            // New user joined, wait for their offer
            console.log('User joined:', data.userId);
            break;

          case 'offer':
            // Received offer from peer
            console.log('Received offer from', data.fromId);
            const pc = await createPeerConnection(data.fromId, false);
            
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              
              ws.send(JSON.stringify({
                type: 'answer',
                targetId: data.fromId,
                answer: pc.localDescription,
              }));
            } catch (error) {
              console.error('Error handling offer:', error);
            }
            break;

          case 'answer':
            // Received answer from peer
            console.log('Received answer from', data.fromId);
            const peer = peersRef.current.get(data.fromId);
            if (peer) {
              try {
                await peer.connection.setRemoteDescription(new RTCSessionDescription(data.answer));
              } catch (error) {
                console.error('Error handling answer:', error);
              }
            }
            break;

          case 'ice-candidate':
            // Received ICE candidate
            const candidatePeer = peersRef.current.get(data.fromId);
            if (candidatePeer && data.candidate) {
              try {
                await candidatePeer.connection.addIceCandidate(new RTCIceCandidate(data.candidate));
              } catch (error) {
                console.error('Error adding ICE candidate:', error);
              }
            }
            break;

          case 'user-left':
            // User left the room
            console.log('User left:', data.userId);
            const leftPeer = peersRef.current.get(data.userId);
            if (leftPeer) {
              leftPeer.connection.close();
              peersRef.current.delete(data.userId);
              setPeers(prev => {
                const newPeers = new Map(prev);
                newPeers.delete(data.userId);
                return newPeers;
              });
            }
            break;
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
      };

    } catch (error) {
      console.error('Error accessing media devices:', error);
      alert('カメラとマイクへのアクセスを許可してください');
    }
  };

  const handleDisconnect = useCallback(() => {
    // Close all peer connections
    peersRef.current.forEach(peer => {
      peer.connection.close();
    });
    setPeers(new Map());
    peersRef.current.clear();

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    setIsConnected(false);
  }, []);

  useEffect(() => {
    return () => {
      handleDisconnect();
    };
  }, [handleDisconnect]);

  return (
    <div className="app">
      <h1>WebRTC ビデオ通話</h1>
      
      {!isConnected ? (
        <div className="controls">
          <input
            type="text"
            placeholder="合言葉を入力"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleCall()}
          />
          <button onClick={handleCall}>通話開始</button>
        </div>
      ) : (
        <button onClick={handleDisconnect} className="disconnect-btn">
          通話終了
        </button>
      )}

      <div className="videos-container">
        <div className="video-wrapper">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
          />
          <div className="video-label">あなた</div>
        </div>

        {Array.from(peers.entries()).map(([peerId, peer]) => (
          <div key={peerId} className="video-wrapper">
            <video
              ref={(videoElement) => {
                if (videoElement && peer.stream) {
                  videoElement.srcObject = peer.stream;
                }
              }}
              autoPlay
              playsInline
            />
            <div className="video-label">相手: {peerId}</div>
          </div>
        ))}
      </div>

      {isConnected && (
        <div className="status">
          <p>接続中: {peers.size}人</p>
          <p>合言葉: {passphrase}</p>
        </div>
      )}
    </div>
  )
}

export default App
