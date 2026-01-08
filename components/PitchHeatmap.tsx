
import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { FootballEvent } from '../types';

interface PitchHeatmapProps {
  events: FootballEvent[];
  intensity?: number;
}

const PitchHeatmap: React.FC<PitchHeatmapProps> = ({ events, intensity = 20 }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [showPoints, setShowPoints] = useState(false);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Base dimensions for the SVG coordinate system
    const baseWidth = 800;
    const baseHeight = 500;
    const margin = { top: 10, right: 10, bottom: 10, left: 10 };

    const width = baseWidth - margin.left - margin.right;
    const height = baseHeight - margin.top - margin.bottom;

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Draw Striped Grass Pattern
    const stripeCount = 12;
    const stripeWidth = width / stripeCount;
    const grassColors = ["#79c788", "#88d196"]; // Vibrant green shades

    for (let i = 0; i < stripeCount; i++) {
      g.append("rect")
        .attr("x", i * stripeWidth)
        .attr("y", 0)
        .attr("width", stripeWidth)
        .attr("height", height)
        .attr("fill", grassColors[i % 2]);
    }

    // Lines styling
    const lineStyle = { stroke: "rgba(255,255,255,0.8)", width: 2 };

    // Outer Boundary
    g.append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "none")
      .attr("stroke", lineStyle.stroke)
      .attr("stroke-width", lineStyle.width);

    // Center Line
    g.append("line")
      .attr("x1", width / 2).attr("y1", 0)
      .attr("x2", width / 2).attr("y2", height)
      .attr("stroke", lineStyle.stroke)
      .attr("stroke-width", lineStyle.width);

    // Center Circle
    g.append("circle")
      .attr("cx", width / 2).attr("cy", height / 2)
      .attr("r", 55)
      .attr("fill", "none")
      .attr("stroke", lineStyle.stroke)
      .attr("stroke-width", lineStyle.width);
    
    // Center Dot
    g.append("circle")
      .attr("cx", width / 2).attr("cy", height / 2)
      .attr("r", 2)
      .attr("fill", lineStyle.stroke);

    // Penalty Areas
    const drawPenaltyArea = (xOffset: number, isRight: boolean) => {
      const areaWidth = width * 0.16;
      const areaHeight = height * 0.6;
      const innerWidth = width * 0.06;
      const innerHeight = height * 0.3;
      const startY = height * 0.2;
      const innerStartY = height * 0.35;

      const x = isRight ? width - areaWidth : 0;
      const innerX = isRight ? width - innerWidth : 0;

      // Big Box
      g.append("rect").attr("x", x).attr("y", startY).attr("width", areaWidth).attr("height", areaHeight).attr("fill", "none").attr("stroke", lineStyle.stroke).attr("stroke-width", lineStyle.width);
      // Small Box
      g.append("rect").attr("x", innerX).attr("y", innerStartY).attr("width", innerWidth).attr("height", innerHeight).attr("fill", "none").attr("stroke", lineStyle.stroke).attr("stroke-width", lineStyle.width);
      // Penalty Spot
      const spotX = isRight ? width - (width * 0.11) : (width * 0.11);
      g.append("circle").attr("cx", spotX).attr("cy", height / 2).attr("r", 2).attr("fill", lineStyle.stroke);
      // Penalty Arc
      const arcPath = isRight 
        ? `M ${width - areaWidth} ${height * 0.4} A 50 50 0 0 0 ${width - areaWidth} ${height * 0.6}`
        : `M ${areaWidth} ${height * 0.4} A 50 50 0 0 1 ${areaWidth} ${height * 0.6}`;
      g.append("path").attr("d", arcPath).attr("fill", "none").attr("stroke", lineStyle.stroke).attr("stroke-width", lineStyle.width);
    };

    drawPenaltyArea(0, false);
    drawPenaltyArea(0, true);

    // Corner Arcs
    const r = 15;
    g.append("path").attr("d", `M 0 ${r} A ${r} ${r} 0 0 0 ${r} 0`).attr("fill", "none").attr("stroke", lineStyle.stroke).attr("stroke-width", lineStyle.width);
    g.append("path").attr("d", `M ${width-r} 0 A ${r} ${r} 0 0 0 ${width} ${r}`).attr("fill", "none").attr("stroke", lineStyle.stroke).attr("stroke-width", lineStyle.width);
    g.append("path").attr("d", `M ${width} ${height-r} A ${r} ${r} 0 0 0 ${width-r} ${height}`).attr("fill", "none").attr("stroke", lineStyle.stroke).attr("stroke-width", lineStyle.width);
    g.append("path").attr("d", `M ${r} ${height} A ${r} ${r} 0 0 0 0 ${height-r}`).attr("fill", "none").attr("stroke", lineStyle.stroke).attr("stroke-width", lineStyle.width);

    // Stop here if no events to map
    if (events.length === 0) return;

    // Scales
    const xScale = d3.scaleLinear().domain([0, 100]).range([0, width]);
    const yScale = d3.scaleLinear().domain([0, 100]).range([0, height]);

    // Density Generation
    const densityData = d3.contourDensity<FootballEvent>()
      .x(d => xScale(d.x))
      .y(d => yScale(d.y))
      .size([width, height])
      .bandwidth(intensity)(events);

    // Color Scale
    const colorScale = d3.scaleLinear<string>()
      .domain([0, 0.1, 0.25, 0.5, 0.75, 1].map(d => d * (d3.max(densityData, d => d.value) || 1)))
      .range(["transparent", "#3b82f6", "#10b981", "#fbbf24", "#f97316", "#ef4444"]);

    g.selectAll("path.contour")
      .data(densityData)
      .enter().append("path")
      .attr("class", "contour")
      .attr("d", d3.geoPath())
      .attr("fill", d => colorScale(d.value))
      .attr("opacity", 0.6)
      .attr("filter", "blur(4px)");

    // Action Points
    if (showPoints) {
      g.selectAll("circle.event")
        .data(events)
        .enter().append("circle")
        .attr("class", "event")
        .attr("cx", d => xScale(d.x))
        .attr("cy", d => yScale(d.y))
        .attr("r", 3)
        .attr("fill", d => d.success ? "white" : "rgba(0,0,0,0.3)")
        .attr("stroke", "rgba(0,0,0,0.2)")
        .attr("stroke-width", 0.5)
        .attr("opacity", 0.8);
    }

  }, [events, showPoints, intensity]);

  return (
    <div className="flex flex-col gap-4 w-full h-full">
      <div className="flex items-center justify-between bg-slate-900/50 p-3 rounded-xl border border-white/5 backdrop-blur-sm w-full">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer group">
            <input 
              type="checkbox" 
              checked={showPoints} 
              onChange={() => setShowPoints(!showPoints)}
              className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-emerald-500 focus:ring-emerald-500"
            />
            <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">Ver pontos de ação</span>
          </label>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold uppercase tracking-widest">
          Foco: 
          <div className="flex gap-0.5">
            <div className="w-3 h-3 bg-blue-500 rounded-sm"></div>
            <div className="w-3 h-3 bg-green-500 rounded-sm"></div>
            <div className="w-3 h-3 bg-yellow-500 rounded-sm"></div>
            <div className="w-3 h-3 bg-red-500 rounded-sm"></div>
          </div>
        </div>
      </div>
      
      <div 
        className="relative bg-emerald-900 rounded-2xl border-4 border-white/20 shadow-2xl overflow-hidden w-full h-full aspect-[8/5]"
      >
        <svg 
          ref={svgRef} 
          viewBox="0 0 800 500" 
          className="w-full h-full block"
          preserveAspectRatio="xMidYMid meet"
        />
      </div>
    </div>
  );
};

export default PitchHeatmap;
