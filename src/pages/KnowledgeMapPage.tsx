import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Network,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sparkles,
  Plus,
  Save,
  Share2,
  Search,
  BrainCircuit,
  Loader2,
} from 'lucide-react';
import { apiFetch } from '../services/api';
import { useApp } from '../context/AppContext';
import { VisualIntelligencePanel } from '../components/visual/VisualIntelligencePanel';

interface MapSummary {
  id: string;
  title: string;
  rootTopic: string;
  isPublic: boolean;
  userId: string | null;
}

interface MapNode {
  nodeKey: string;
  label: string;
  category: string;
  definition: string;
  explanation?: string | null;
  depth: number;
  x: number;
  y: number;
  keyConcepts: string[];
}

interface MapEdge {
  sourceKey: string;
  targetKey: string;
  relation: string;
}

export const KnowledgeMapPage: React.FC = () => {
  const { user, addToast } = useApp();

  const [maps, setMaps] = useState<MapSummary[]>([]);
  const [activeMap, setActiveMap] = useState<MapSummary | null>(null);
  const [nodes, setNodes] = useState<MapNode[]>([]);
  const [edges, setEdges] = useState<MapEdge[]>([]);
  const [selectedNode, setSelectedNode] = useState<MapNode | null>(null);

  const [zoom, setZoom] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [topicInput, setTopicInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [mapGenMeta, setMapGenMeta] = useState<{ aiGenerated: boolean; modelUsed?: string; warning?: string } | null>(
    null
  );

  // Add node controls
  const [newNodeLabel, setNewNodeLabel] = useState('');
  const [newNodeDef, setNewNodeDef] = useState('');
  const [connectToKey, setConnectToKey] = useState('');

  const loadMaps = async () => {
    try {
      const data = await apiFetch<{ maps: MapSummary[] }>('/api/knowledge-maps');
      setMaps(data.maps || []);
      if (data.maps?.length > 0 && !activeMap) {
        openMap(data.maps[0].id);
      }
    } catch {
      // ignore
    }
  };

  const openMap = async (id: string) => {
    try {
      const data = await apiFetch<{ map: MapSummary; nodes: MapNode[]; edges: MapEdge[] }>(
        `/api/knowledge-maps/${id}`
      );
      setActiveMap(data.map);
      setNodes(data.nodes || []);
      setEdges(data.edges || []);
      setSelectedNode(data.nodes?.[0] || null);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadMaps();
  }, [user]);

  const handleGenerateTopicMap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topicInput.trim()) return;
    setGenerating(true);
    try {
      const data = await apiFetch<{
        nodes: MapNode[];
        edges: MapEdge[];
        aiGenerated?: boolean;
        modelUsed?: string;
        warning?: string;
      }>('/api/knowledge-maps/expand', {
        method: 'POST',
        body: JSON.stringify({ concept: topicInput.trim() }),
      });
      setActiveMap({
        id: '',
        title: `${topicInput.trim()} Concept Graph`,
        rootTopic: topicInput.trim(),
        isPublic: false,
        userId: user?.id || null,
      });
      setNodes(data.nodes || []);
      setEdges(data.edges || []);
      setSelectedNode(data.nodes?.[0] || null);
      setMapGenMeta({
        aiGenerated: data.aiGenerated !== false,
        modelUsed: data.modelUsed,
        warning: data.warning,
      });
      addToast(`Generated concept map for "${topicInput.trim()}".`, 'success');
    } catch (err: any) {
      addToast(err.message || 'Unable to generate map.', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleAddNode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNodeLabel.trim()) return;
    const key = `node_${Date.now()}`;
    const nextNode: MapNode = {
      nodeKey: key,
      label: newNodeLabel.trim(),
      category: 'Custom',
      definition: newNodeDef.trim() || `User-added concept related to ${activeMap?.rootTopic || 'topic'}.`,
      explanation: '',
      depth: 2,
      x: 160 + Math.floor(Math.random() * 520),
      y: 120 + Math.floor(Math.random() * 280),
      keyConcepts: [],
    };
    setNodes((prev) => [...prev, nextNode]);
    if (connectToKey) {
      setEdges((prev) => [...prev, { sourceKey: connectToKey, targetKey: key, relation: 'connects to' }]);
    }
    setSelectedNode(nextNode);
    setNewNodeLabel('');
    setNewNodeDef('');
  };

  const handleSaveMap = async () => {
    if (!user) {
      addToast('Sign in to save custom knowledge maps.', 'warning');
      return;
    }
    try {
      if (activeMap?.id && activeMap.userId === user.id) {
        await apiFetch(`/api/knowledge-maps/${activeMap.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ title: activeMap.title, isPublic: activeMap.isPublic, nodes, edges }),
        });
      } else {
        const res = await apiFetch<{ map: MapSummary }>('/api/knowledge-maps', {
          method: 'POST',
          body: JSON.stringify({
            title: activeMap?.title || 'Custom Knowledge Map',
            rootTopic: activeMap?.rootTopic || 'Research',
            isPublic: false,
            nodes,
            edges,
          }),
        });
        setActiveMap(res.map);
      }
      loadMaps();
      addToast('Knowledge map saved to PostgreSQL.', 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to save map.', 'error');
    }
  };

  const visibleNodes =
    categoryFilter === 'All' ? nodes : nodes.filter((n) => n.category === categoryFilter);
  const categoriesList = ['All', ...Array.from(new Set(nodes.map((n) => n.category)))];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#258BFF] dark:text-[#B7F34A]">
            <Network className="w-4 h-4" /> Interactive Concept Graph
          </div>
          <h1 className="text-3xl font-extrabold text-[#071426] dark:text-white">2MR Knowledge Map</h1>
          <p className="text-xs text-[#8793A5]">
            Explore linked concepts visually, inspect definitions, add custom nodes, and jump into deep research.
          </p>
        </div>

        <form onSubmit={handleGenerateTopicMap} className="flex gap-2">
          <input
            type="text"
            value={topicInput}
            onChange={(e) => setTopicInput(e.target.value)}
            placeholder="Generate map for any topic..."
            className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#10243D] text-sm w-60"
          />
          <button
            type="submit"
            disabled={generating}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#B7F34A] text-[#071426] text-xs font-bold"
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Generate
          </button>
        </form>
      </div>

      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D]">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={activeMap?.id || ''}
            onChange={(e) => e.target.value && openMap(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs font-semibold"
          >
            {maps.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
            {!activeMap?.id && activeMap && <option value="">{activeMap.title} (Draft)</option>}
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
          >
            {categoriesList.map((c) => (
              <option key={c} value={c}>
                Filter: {c}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(1.5, z + 0.15))}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-[#258BFF]"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.65, z - 0.15))}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-[#258BFF]"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-[#258BFF]"
            title="Reset View"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleSaveMap}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#258BFF] text-white text-xs font-semibold"
          >
            <Save className="w-3.5 h-3.5" /> Save Map
          </button>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(window.location.href);
              addToast('Map link copied to clipboard.', 'success');
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold"
          >
            <Share2 className="w-3.5 h-3.5" /> Share
          </button>
        </div>
      </div>

      {mapGenMeta && (
        <div className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-[#258BFF] dark:text-[#B7F34A]">
            {mapGenMeta.aiGenerated
              ? `AI-Generated Concept Map${mapGenMeta.modelUsed ? ` · ${mapGenMeta.modelUsed}` : ''}`
              : 'Standard Concept Map Template'}
          </span>
          {mapGenMeta.warning && <span className="text-amber-600 dark:text-amber-400">{mapGenMeta.warning}</span>}
        </div>
      )}

      {/* Main Graph + Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#071426] overflow-auto relative min-h-[500px]">
          <svg
            viewBox="0 0 860 520"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
            className="w-full h-[500px] transition-transform"
          >
            {/* Relationship Edges */}
            {edges.map((edge, idx) => {
              const src = nodes.find((n) => n.nodeKey === edge.sourceKey);
              const tgt = nodes.find((n) => n.nodeKey === edge.targetKey);
              if (!src || !tgt) return null;
              const mx = (src.x + tgt.x) / 2;
              const my = (src.y + tgt.y) / 2;
              return (
                <g key={idx}>
                  <line
                    x1={src.x}
                    y1={src.y}
                    x2={tgt.x}
                    y2={tgt.y}
                    stroke="#258BFF"
                    strokeOpacity={0.45}
                    strokeWidth={2}
                  />
                  <text
                    x={mx}
                    y={my - 6}
                    textAnchor="middle"
                    className="fill-slate-400 text-[10px] font-medium"
                  >
                    {edge.relation}
                  </text>
                </g>
              );
            })}

            {/* Concept Nodes */}
            {visibleNodes.map((node) => {
              const isSelected = selectedNode?.nodeKey === node.nodeKey;
              return (
                <g
                  key={node.nodeKey}
                  onClick={() => setSelectedNode(node)}
                  className="cursor-pointer"
                >
                  <rect
                    x={node.x - 78}
                    y={node.y - 26}
                    width={156}
                    height={52}
                    rx={12}
                    fill={isSelected ? '#258BFF' : '#10243D'}
                    stroke={isSelected ? '#B7F34A' : '#334155'}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                  />
                  <text
                    x={node.x}
                    y={node.y - 2}
                    textAnchor="middle"
                    className="fill-white text-[12px] font-bold"
                  >
                    {node.label.slice(0, 20)}
                  </text>
                  <text
                    x={node.x}
                    y={node.y + 14}
                    textAnchor="middle"
                    className="fill-[#B7F34A] text-[10px]"
                  >
                    {node.category}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Node Inspector & Custom Node Builder */}
        <aside className="lg:col-span-4 space-y-5">
          {selectedNode && (
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-[#258BFF] dark:text-[#B7F34A]">
                {selectedNode.category}
              </div>
              <h2 className="text-xl font-bold text-[#071426] dark:text-white">{selectedNode.label}</h2>
              <p className="text-sm text-slate-600 dark:text-slate-200">{selectedNode.definition}</p>
              {selectedNode.explanation && (
                <p className="text-xs text-slate-500 dark:text-[#8793A5]">{selectedNode.explanation}</p>
              )}

              {selectedNode.keyConcepts?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {selectedNode.keyConcepts.map((kc) => (
                    <span
                      key={kc}
                      className="px-2 py-0.5 rounded bg-slate-100 dark:bg-[#071426] text-[11px]"
                    >
                      {kc}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                <Link
                  to={`/search?q=${encodeURIComponent(selectedNode.label)}`}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#258BFF] text-white font-semibold"
                >
                  <Search className="w-3.5 h-3.5" /> Search
                </Link>
                <Link
                  to={`/research?topic=${encodeURIComponent(selectedNode.label)}`}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#B7F34A] text-[#071426] font-bold"
                >
                  <BrainCircuit className="w-3.5 h-3.5" /> Research
                </Link>
              </div>
            </div>
          )}

          {/* Add Custom Node */}
          <form
            onSubmit={handleAddNode}
            className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3"
          >
            <h3 className="text-sm font-bold text-[#071426] dark:text-white">Add Concept Node</h3>
            <input
              type="text"
              required
              value={newNodeLabel}
              onChange={(e) => setNewNodeLabel(e.target.value)}
              placeholder="Concept label..."
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
            />
            <input
              type="text"
              value={newNodeDef}
              onChange={(e) => setNewNodeDef(e.target.value)}
              placeholder="Short definition..."
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
            />
            <select
              value={connectToKey}
              onChange={(e) => setConnectToKey(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
            >
              <option value="">Connect from node (optional)...</option>
              {nodes.map((n) => (
                <option key={n.nodeKey} value={n.nodeKey}>
                  {n.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl border border-[#258BFF] text-[#258BFF] dark:text-[#B7F34A] text-xs font-semibold"
            >
              <Plus className="w-3.5 h-3.5" /> Add Node to Graph
            </button>
          </form>
        </aside>
      </div>

      {(activeMap || selectedNode || nodes.length > 0) && (
        <VisualIntelligencePanel
          feature="knowledge_map"
          query={selectedNode ? `${activeMap?.rootTopic || ''} ${selectedNode.label}`.trim() : activeMap?.rootTopic || 'Knowledge Concept Graph'}
          contextText={
            selectedNode
              ? `${selectedNode.definition} ${selectedNode.explanation || ''}`
              : nodes.map((n) => `${n.label}: ${n.definition}`).join('\n')
          }
          mapContext={{
            rootTopic: activeMap?.rootTopic || selectedNode?.label,
            nodes: nodes.map((n) => ({
              nodeKey: n.nodeKey,
              label: n.label,
              category: n.category,
              definition: n.definition,
            })),
            edges,
          }}
          autoRun={true}
          compact
        />
      )}
    </div>
  );
};
