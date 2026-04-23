import React, { useState, useEffect, useRef } from 'react';
import { Search, Globe, FileText, Download, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

function App() {
    const [inputType, setInputType] = useState('text'); // 'text' | 'url'
    const [content, setContent] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [logs, setLogs] = useState([]);
    const [progress, setProgress] = useState(0);
    const [results, setResults] = useState([]);
    const [csvData, setCsvData] = useState(null);
    const [error, setError] = useState(null);
    const [depth, setDepth] = useState(1); // 크롤링 깊이
    const [linkCount, setLinkCount] = useState(0); // 수집된 링크 수
    const logEndRef = useRef(null);

    useEffect(() => {
        if (logEndRef.current) {
            logEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs]);

    const addLog = (message) => {
        setLogs(prev => [...prev.slice(-100), { id: Date.now(), message }]);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!content.trim()) return;

        setIsProcessing(true);
        setLogs([]);
        setProgress(0);
        setLinkCount(0);
        setResults([]);
        setCsvData(null);
        setError(null);
        addLog('서버에 연결하는 중...');

        try {
            const response = await fetch('http://localhost:5050/api/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: inputType, content, depth })
            });

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const parts = buffer.split('\n\n');

                // 마지막 부분은 완료되지 않았을 수 있으므로 버퍼에 남김
                buffer = parts.pop();

                for (const part of parts) {
                    const lines = part.split('\n');
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.substring(6));

                                if (data.status === 'searching') {
                                    const percent = (data.current / data.total) * 100;
                                    setProgress(percent);
                                }

                                if (data.linkCount !== undefined) {
                                    setLinkCount(data.linkCount);
                                }

                                if (data.message) {
                                    addLog(data.message);
                                }

                                if (data.status === 'completed') {
                                    setResults(data.results);
                                    setCsvData(data.csv);
                                    setIsProcessing(false);
                                    setProgress(100);
                                } else if (data.status === 'error') {
                                    setError(data.message);
                                    setIsProcessing(false);
                                }
                            } catch (e) {
                                console.error('JSON parse error:', e, line);
                            }
                        }
                    }
                }
            }
        } catch (err) {
            setError('서버 연결에 실패했습니다. 서버가 실행 중인지 확인해주세요.');
            setIsProcessing(false);
        }
    };

    const downloadCsv = () => {
        if (!csvData) return;
        const blob = new Blob(["\uFEFF" + csvData], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `business_links_${new Date().getTime()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="container">
            <header>
                <h1>Business Link Finder</h1>
                <p>텍스트나 웹사이트에서 상호를 추출하고 공식 홈페이지를 찾아드립니다.</p>
            </header>

            <main className="glass-panel">
                <form className="input-section" onSubmit={handleSubmit}>
                    <div className="tab-group">
                        <button
                            type="button"
                            className={`tab-btn ${inputType === 'text' ? 'active' : ''}`}
                            onClick={() => setInputType('text')}
                        >
                            <FileText size={18} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                            텍스트 입력
                        </button>
                        <button
                            type="button"
                            className={`tab-btn ${inputType === 'url' ? 'active' : ''}`}
                            onClick={() => setInputType('url')}
                        >
                            <Globe size={18} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                            웹 주소(URL)
                        </button>
                    </div>

                    {inputType === 'text' ? (
                        <textarea
                            placeholder="여기에 상호명이 포함된 텍스트를 붙여넣으세요..."
                            rows={8}
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            disabled={isProcessing}
                        />
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <input
                                type="text"
                                placeholder="https://example.com/partners"
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                disabled={isProcessing}
                            />
                            <div className="depth-control" style={{
                                background: 'rgba(255, 255, 255, 0.03)',
                                padding: '1rem',
                                borderRadius: '12px',
                                border: '1px solid var(--border-color)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '1.5rem'
                            }}>
                                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', minWidth: '80px' }}>탐색 깊이: {depth}단계</span>
                                <input
                                    type="range"
                                    min="0"
                                    max="5"
                                    value={depth}
                                    onChange={(e) => setDepth(parseInt(e.target.value))}
                                    disabled={isProcessing}
                                    style={{ flex: 1, accentColor: 'var(--accent-color)' }}
                                />
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                    {depth === 0 ? '이 페이지만' : `${depth}단계 하위까지`}
                                </span>
                            </div>
                        </div>
                    )}

                    <button type="submit" className="submit-btn" disabled={isProcessing || !content.trim()}>
                        {isProcessing ? (
                            <>
                                <Loader2 className="animate-spin" />
                                처리 중...
                            </>
                        ) : (
                            <>
                                <Search size={20} />
                                데이터 수집 시작
                            </>
                        )}
                    </button>
                </form>

                {(isProcessing || logs.length > 0) && (
                    <div className="status-section">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
                            <div>
                                <span style={{ fontWeight: 600, fontSize: '1.1rem', display: 'block' }}>실시간 처리 현황</span>
                                <span style={{ color: 'var(--accent-color)', fontSize: '0.9rem', fontWeight: 500 }}>
                                    {linkCount > 0 ? `🔥 유효 외부 도메인 ${linkCount}개 발견됨` : '준비 중...'}
                                </span>
                            </div>
                            <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{Math.round(progress)}%</span>
                        </div>
                        <div className="progress-container">
                            <div className="progress-bar" style={{ width: `${progress}%` }}></div>
                        </div>
                        <div className="log-container">
                            {logs.map(log => (
                                <div key={log.id} className="log-entry">
                                    {`> ${log.message}`}
                                </div>
                            ))}
                            <div ref={logEndRef} />
                        </div>
                    </div>
                )}

                {error && (
                    <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '16px', color: '#fca5a5', display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <AlertCircle size={24} />
                        {error}
                    </div>
                )}

                {results.length > 0 && !isProcessing && (
                    <div className="results-section">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2>수집 결과 ({results.length}건)</h2>
                            <button onClick={downloadCsv} className="download-link" style={{ border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                                <Download size={18} />
                                CSV 다운로드
                            </button>
                        </div>

                        <div style={{ overflowX: 'auto', marginTop: '1.5rem' }}>
                            <table>
                                <thead>
                                    <tr>
                                        <th>상호명</th>
                                        <th>홈페이지 주소</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.map((res, i) => (
                                        <tr key={i}>
                                            <td style={{ fontWeight: 500 }}>{res.name}</td>
                                            <td>
                                                {res.homepage !== '찾을 수 없음' ? (
                                                    <a href={res.homepage} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-color)', textDecoration: 'none' }}>
                                                        {res.homepage}
                                                    </a>
                                                ) : (
                                                    <span style={{ color: 'var(--text-secondary)' }}>{res.homepage}</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

export default App;
