import { Loader2, Play, Shield, Sparkles, X } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent } from "react";
import { boardZoom, flowHandleIds, portalNodeSize, templates } from "../domain/constants";
import type { FlowHandleId } from "../domain/constants";
import type { AiPlannerResult, Connection, Edge, PendingWriteRun, PortalFlowNode, PortalNodeKind, Template, XYPosition } from "../domain/types";
import { hydrateCommand, templateForKind } from "../flow/workflow";

type PortalNodeCardProps = {
  node: PortalFlowNode;
  selected: boolean;
  isConnectable: boolean;
  onHandlePointerDown: (event: PointerEvent<HTMLButtonElement>, handle: FlowHandleId) => void;
};

const PortalNodeCard = memo(function PortalNodeCard({
  node,
  selected,
  isConnectable,
  onHandlePointerDown,
}: PortalNodeCardProps) {
  const { data } = node;
  const template = templates.find((item) => item.kind === data.kind) || templates[0];
  const Icon = template.icon;

  return (
    <div className={`portal-node ${selected ? "selected" : ""}`}>
      {flowHandleIds.map((handle) => (
        <button
          key={handle}
          type="button"
          aria-label={`${data.label} ${handle} connector`}
          className={`portal-node__handle portal-node__handle--${handle}`}
          data-node-id={node.id}
          data-flow-handle={handle}
          disabled={!isConnectable}
          onPointerDown={(event) => onHandlePointerDown(event, handle)}
        />
      ))}
      <div className="portal-node__top">
        <span className={`portal-node__icon ${data.status}`}>
          {data.status === "running" ? <Loader2 className="spin" size={18} /> : <Icon size={18} />}
        </span>
        <span className={`portal-node__status ${data.status}`}>{data.status}</span>
      </div>
      <div className="portal-node__title">{data.label}</div>
      <div className="portal-node__description">{data.description}</div>
    </div>
  );
});

type AiFlowModalProps = {
  open: boolean;
  prompt: string;
  result: AiPlannerResult | null;
  needsRunConfirm: boolean;
  generating: boolean;
  replaceBoard: boolean;
  onClose: () => void;
  onPromptChange: (value: string) => void;
  onGenerate: () => void;
  onApply: () => void;
  onApplyAndRun: () => void;
  onConfirmRunChange: (value: boolean) => void;
  onReplaceBoardChange: (value: boolean) => void;
};

export function AiFlowModal({
  open,
  prompt,
  result,
  needsRunConfirm,
  generating,
  replaceBoard,
  onClose,
  onPromptChange,
  onGenerate,
  onApply,
  onApplyAndRun,
  onConfirmRunChange,
  onReplaceBoardChange,
}: AiFlowModalProps) {
  if (!open) {
    return null;
  }

  const plan = result?.plan || null;
  const errors = result?.errors || [];

  return (
    <div className="ai-modal-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="ai-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-flow-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="ai-modal__header">
          <div>
            <span className="ai-modal__eyebrow">
              {result?.source === "openai" || result?.source === "openrouter" || result?.source === "gemini"
                ? `${result.source === "gemini" ? "Gemini" : result.source === "openrouter" ? "OpenRouter" : "OpenAI"} planner${result.model ? ` · ${result.model}` : ""}`
                : "Safe planner"}
            </span>
            <h2 id="ai-flow-title">AI Flow Builder</h2>
          </div>
          <button className="icon-button ai-modal__close" type="button" aria-label="Close AI Flow Builder" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <label className="ai-prompt">
          <span>Prompt</span>
          <textarea
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            placeholder="Type your prompt here, e.g. 'Transfer 0.001 POT to Bob on my local node'"
          />
        </label>

        <div className="ai-modal__actions">
          <button className="text-button" type="button" onClick={onGenerate} disabled={generating}>
            <Sparkles size={16} />
            {generating ? "Generating..." : "Generate flow"}
          </button>
        </div>
        {errors.length > 0 ? (
          <div className="ai-errors" role="alert">
            {errors.map((error) => (
              <div key={error}>{error}</div>
            ))}
          </div>
        ) : null}

        {plan ? (
          <div className="ai-plan-preview">
            <div className="ai-plan-preview__summary">
              <strong>{plan.title}</strong>
              <span>{plan.summary}</span>
            </div>
            <div className="ai-plan-list">
              {plan.steps.map((step, index) => {
                const template = templateForKind(step.kind);
                return (
                  <article key={step.kind} className="ai-plan-step">
                    <span>{index + 1}</span>
                    <div>
                      <strong>{template?.label || step.kind}</strong>
                      <small>{hydrateCommand(template?.command || "", { ...(template?.config || {}), ...step.config })}</small>
                    </div>
                  </article>
                );
              })}
            </div>
            <label className="ai-run-confirm">
              <input
                type="checkbox"
                checked={needsRunConfirm}
                onChange={(event) => onConfirmRunChange(event.target.checked)}
              />
              <span>I understand Apply & run may submit a real local transfer transaction.</span>
            </label>
            <label className="ai-run-confirm">
              <input
                type="checkbox"
                checked={replaceBoard}
                onChange={(event) => onReplaceBoardChange(event.target.checked)}
              />
              <span>Replace the current board instead of appending this AI flow.</span>
            </label>
          </div>
        ) : null}

        <div className="ai-modal__footer">
          <button className="text-button quiet" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="text-button" type="button" onClick={onApply} disabled={!plan}>
            Apply to board
          </button>
          <button className="text-button active-mode" type="button" onClick={onApplyAndRun} disabled={!plan || !needsRunConfirm || !replaceBoard}>
            <Play size={16} />
            Apply & run
          </button>
        </div>
      </section>
    </div>
  );
}

type WriteActionConfirmModalProps = {
  pending: PendingWriteRun | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export function WriteActionConfirmModal({ pending, onCancel, onConfirm }: WriteActionConfirmModalProps) {
  if (!pending) {
    return null;
  }

  return (
    <div className="ai-modal-overlay" role="presentation" onMouseDown={onCancel}>
      <section
        className="ai-modal write-confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="write-confirm-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="ai-modal__header">
          <div>
            <span className="ai-modal__eyebrow">Write action</span>
            <h2 id="write-confirm-title">{pending.title}</h2>
          </div>
          <button className="icon-button ai-modal__close" type="button" aria-label="Cancel write action" onClick={onCancel}>
            <X size={18} />
          </button>
        </div>

        <div className="write-confirm-summary">
          <div>
            <span>Endpoint</span>
            <strong>{pending.endpoint}</strong>
          </div>
          <div>
            <span>Write nodes</span>
            <strong>{pending.nodes.map((node) => node.data.label).join(", ")}</strong>
          </div>
        </div>

        <div className="ai-warnings" role="status">
          This action may submit a transaction or instantiate/call a contract on the current local chain. Review the command preview before continuing.
        </div>

        <label className="ai-prompt">
          <span>Command preview</span>
          <pre className="write-confirm-command">{pending.commandPreview}</pre>
        </label>

        <div className="ai-modal__footer">
          <button className="text-button quiet" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="text-button active-mode" type="button" onClick={onConfirm}>
            <Shield size={16} />
            Confirm write
          </button>
        </div>
      </section>
    </div>
  );
}

type LightweightFlowCanvasProps = {
  nodes: PortalFlowNode[];
  edges: Edge[];
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  flowConnectMode: boolean;
  onMoveNodes: (nodeIds: string[], delta: XYPosition) => void;
  onNodeDragEnd: (nodeIds: string[]) => void;
  onSelectNode: (nodeId: string, append: boolean) => void;
  onSelectEdge: (edgeId: string, append: boolean) => void;
  onSelectCanvas: () => void;
  onConnect: (connection: Connection) => void;
  onDropTemplate: (template: Template, position: XYPosition) => void;
};

function handlePoint(node: PortalFlowNode, handle?: string | null) {
  const side = (handle || "right") as FlowHandleId;
  const { x, y } = node.position;

  if (side === "left") {
    return { x, y: y + portalNodeSize.height / 2 };
  }
  if (side === "top") {
    return { x: x + portalNodeSize.width / 2, y };
  }
  if (side === "bottom") {
    return { x: x + portalNodeSize.width / 2, y: y + portalNodeSize.height };
  }
  return { x: x + portalNodeSize.width, y: y + portalNodeSize.height / 2 };
}

function handleVector(handle?: string | null) {
  const side = (handle || "right") as FlowHandleId;

  if (side === "left") {
    return { x: -1, y: 0 };
  }
  if (side === "top") {
    return { x: 0, y: -1 };
  }
  if (side === "bottom") {
    return { x: 0, y: 1 };
  }
  return { x: 1, y: 0 };
}

function edgePath(source: XYPosition, target: XYPosition, sourceHandle?: string | null, targetHandle?: string | null) {
  const sourceVector = handleVector(sourceHandle);
  const targetVector = handleVector(targetHandle);
  const distance = Math.hypot(target.x - source.x, target.y - source.y);
  const controlDistance = Math.min(180, Math.max(44, distance * 0.34));
  const sourceControl = {
    x: source.x + sourceVector.x * controlDistance,
    y: source.y + sourceVector.y * controlDistance,
  };
  const targetControl = {
    x: target.x + targetVector.x * controlDistance,
    y: target.y + targetVector.y * controlDistance,
  };

  return `M ${source.x} ${source.y} C ${sourceControl.x} ${sourceControl.y}, ${targetControl.x} ${targetControl.y}, ${target.x} ${target.y}`;
}

type ConnectingState = {
  source: string;
  sourceHandle: FlowHandleId;
  target: XYPosition;
};

export function LightweightFlowCanvas({
  nodes,
  edges,
  selectedNodeIds,
  selectedEdgeIds,
  flowConnectMode,
  onMoveNodes,
  onNodeDragEnd,
  onSelectNode,
  onSelectEdge,
  onSelectCanvas,
  onConnect,
  onDropTemplate,
}: LightweightFlowCanvasProps) {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingMoveRef = useRef<{ nodeIds: string[]; delta: XYPosition } | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    nodeIds: string[];
    origin: XYPosition;
    lastDelta: XYPosition;
  } | null>(null);
  const panRef = useRef<{ pointerId: number; origin: XYPosition; viewport: XYPosition } | null>(null);
  const [viewport, setViewport] = useState({ x: 28, y: 28, zoom: 0.88 });
  const [connecting, setConnecting] = useState<ConnectingState | null>(null);
  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  function screenToFlow(clientX: number, clientY: number) {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) {
      return { x: 0, y: 0 };
    }

    return {
      x: (clientX - rect.left - viewport.x) / viewport.zoom,
      y: (clientY - rect.top - viewport.y) / viewport.zoom,
    };
  }

  function flushMove() {
    rafRef.current = null;
    const pending = pendingMoveRef.current;
    if (!pending) {
      return;
    }
    pendingMoveRef.current = null;
    onMoveNodes(pending.nodeIds, pending.delta);
  }

  function scheduleMove(nodeIds: string[], delta: XYPosition) {
    pendingMoveRef.current = { nodeIds, delta };
    if (rafRef.current === null) {
      rafRef.current = window.requestAnimationFrame(flushMove);
    }
  }

  function startNodeDrag(event: PointerEvent<HTMLDivElement>, nodeId: string) {
    if (event.button !== 0 || (event.target as HTMLElement).closest("[data-flow-handle]")) {
      return;
    }

    const append = event.shiftKey || event.metaKey || event.ctrlKey;
    onSelectNode(nodeId, append);
    const nodeIds = selectedNodeIds.includes(nodeId) && !append ? selectedNodeIds : [nodeId];
    dragRef.current = {
      pointerId: event.pointerId,
      nodeIds,
      origin: { x: event.clientX, y: event.clientY },
      lastDelta: { x: 0, y: 0 },
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveNodeDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const nextDelta = {
      x: (event.clientX - drag.origin.x) / viewport.zoom,
      y: (event.clientY - drag.origin.y) / viewport.zoom,
    };
    const frameDelta = {
      x: nextDelta.x - drag.lastDelta.x,
      y: nextDelta.y - drag.lastDelta.y,
    };
    drag.lastDelta = nextDelta;
    scheduleMove(drag.nodeIds, frameDelta);
  }

  function stopNodeDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      flushMove();
    }
    dragRef.current = null;
    onNodeDragEnd(drag.nodeIds);
  }

  function startPan(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.button !== 1) {
      return;
    }

    event.preventDefault();
    panRef.current = {
      pointerId: event.pointerId,
      origin: { x: event.clientX, y: event.clientY },
      viewport: { x: viewport.x, y: viewport.y },
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function movePan(event: PointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) {
      return;
    }
    setViewport((current) => ({
      ...current,
      x: pan.viewport.x + event.clientX - pan.origin.x,
      y: pan.viewport.y + event.clientY - pan.origin.y,
    }));
  }

  function stopPan(event: PointerEvent<HTMLDivElement>) {
    if (panRef.current?.pointerId === event.pointerId) {
      panRef.current = null;
    }
  }

  const zoomBoard = useCallback((event: globalThis.WheelEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const deltaModeScale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1;
    const wheelDeltaX = event.deltaX * deltaModeScale;
    const wheelDeltaY = event.deltaY * deltaModeScale;
    const shouldZoom = event.ctrlKey || event.metaKey || event.altKey;

    if (!shouldZoom) {
      setViewport((current) => ({
        ...current,
        x: current.x - (event.shiftKey ? wheelDeltaY : wheelDeltaX),
        y: current.y - (event.shiftKey ? 0 : wheelDeltaY),
      }));
      return;
    }

    setViewport((current) => {
      const nextZoom = Math.min(boardZoom.max, Math.max(boardZoom.min, current.zoom - wheelDeltaY * boardZoom.wheelSpeed));
      const flow = {
        x: (pointer.x - current.x) / current.zoom,
        y: (pointer.y - current.y) / current.zoom,
      };

      return {
        zoom: nextZoom,
        x: pointer.x - flow.x * nextZoom,
        y: pointer.y - flow.y * nextZoom,
      };
    });
  }, []);

  useEffect(() => {
    const board = boardRef.current;
    if (!board) {
      return;
    }

    const wheelTarget = board.parentElement || board;
    wheelTarget.addEventListener("wheel", zoomBoard, { passive: false });
    return () => wheelTarget.removeEventListener("wheel", zoomBoard);
  }, [zoomBoard]);

  function startConnection(event: PointerEvent<HTMLButtonElement>, nodeId: string, sourceHandle: FlowHandleId) {
    if (!flowConnectMode) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const sourceNode = nodesById.get(nodeId);
    setConnecting({
      source: nodeId,
      sourceHandle,
      target: sourceNode ? handlePoint(sourceNode, sourceHandle) : screenToFlow(event.clientX, event.clientY),
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveConnection(event: PointerEvent<HTMLDivElement>) {
    if (!connecting) {
      return;
    }
    const pointer = screenToFlow(event.clientX, event.clientY);
    setConnecting((current) => current ? { ...current, target: pointer } : null);
  }

  function finishConnection(event: PointerEvent<HTMLDivElement>) {
    if (!connecting) {
      return;
    }

    const hitTarget = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-node-id][data-flow-handle]");

    if (hitTarget && hitTarget.dataset.nodeId !== connecting.source) {
      onConnect({
        source: connecting.source,
        target: hitTarget.dataset.nodeId || null,
        sourceHandle: connecting.sourceHandle,
        targetHandle: hitTarget.dataset.flowHandle || "left",
      });
    }
    setConnecting(null);
  }

  function dropTemplate(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const templateKind = event.dataTransfer.getData("application/portal-template") as PortalNodeKind;
    const template = templates.find((item) => item.kind === templateKind);
    if (template) {
      onDropTemplate(template, screenToFlow(event.clientX, event.clientY));
    }
  }

  return (
    <div
      ref={boardRef}
      className={`flow-board ${flowConnectMode ? "flow-board--connect" : ""}`}
      onPointerDown={(event) => {
        const interactiveTarget = (event.target as HTMLElement).closest(".flow-board__node, .flow-board__edge");
        if (!interactiveTarget) {
          onSelectCanvas();
          startPan(event);
        }
      }}
      onPointerMove={(event) => {
        movePan(event);
        moveConnection(event);
      }}
      onPointerUp={(event) => {
        stopPan(event);
        finishConnection(event);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={dropTemplate}
    >
      <div
        className="flow-board__grid"
        style={{
          backgroundPosition: `${viewport.x}px ${viewport.y}px`,
          backgroundSize: `${24 * viewport.zoom}px ${24 * viewport.zoom}px`,
        }}
      />
      <div
        className="flow-board__world"
        style={{ transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.zoom})` }}
      >
        <svg className="flow-board__edges" width="2600" height="1200" viewBox="0 0 2600 1200">
          <defs>
            <marker id="flow-arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="strokeWidth">
              <path d="M 2 2 L 10 6 L 2 10 z" />
            </marker>
          </defs>
          {edges.map((edge) => {
            const source = nodesById.get(edge.source);
            const target = nodesById.get(edge.target);
            if (!source || !target) {
              return null;
            }
            const sourcePoint = handlePoint(source, edge.sourceHandle);
            const targetPoint = handlePoint(target, edge.targetHandle);
            return (
              <g
                key={edge.id}
                tabIndex={0}
                role="button"
                aria-label={`Line from ${source.data.label} to ${target.data.label}`}
                className={`flow-board__edge ${edge.className || ""} ${selectedEdgeIds.includes(edge.id) ? "selected" : ""}`}
                onFocus={() => onSelectEdge(edge.id, false)}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onSelectEdge(edge.id, event.shiftKey || event.metaKey || event.ctrlKey);
                }}
              >
                <path className="flow-board__edge-hit" d={edgePath(sourcePoint, targetPoint, edge.sourceHandle, edge.targetHandle)} />
                <path
                  className="flow-board__edge-path"
                  d={edgePath(sourcePoint, targetPoint, edge.sourceHandle, edge.targetHandle)}
                  markerEnd="url(#flow-arrow)"
                />
              </g>
            );
          })}
          {connecting ? (
            <path
              className="flow-board__edge-path flow-board__edge-preview"
              d={edgePath(
                handlePoint(nodesById.get(connecting.source)!, connecting.sourceHandle),
                connecting.target,
                connecting.sourceHandle,
                null,
              )}
            />
          ) : null}
        </svg>
        {nodes.map((node) => (
          <div
            key={node.id}
            tabIndex={0}
            role="button"
            aria-label={node.data.label}
            className="flow-board__node"
            style={{ transform: `translate3d(${node.position.x}px, ${node.position.y}px, 0)` }}
            onFocus={() => onSelectNode(node.id, false)}
            onPointerDown={(event) => startNodeDrag(event, node.id)}
            onPointerMove={moveNodeDrag}
            onPointerUp={stopNodeDrag}
            onPointerCancel={stopNodeDrag}
          >
            <PortalNodeCard
              node={node}
              selected={selectedNodeIds.includes(node.id)}
              isConnectable={flowConnectMode}
              onHandlePointerDown={(event, handle) => startConnection(event, node.id, handle)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
