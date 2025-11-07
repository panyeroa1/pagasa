import React from 'react';

// The user-specified URL for significant wave height analysis.
const mapUrl = 'https://earth.nullschool.net/#current/ocean/surface/level/overlay=significant_wave_height/orthographic=129.18,12.03,1525/loc=121.714,17.626';

export const MapDisplay: React.FC = () => {
  return (
    <div className="relative w-full h-full bg-black">
      <iframe
        className="absolute top-0 left-0 w-full h-full border-0"
        src={mapUrl}
        title="Earth Map Display - Wave Height"
        allowFullScreen
        sandbox="allow-scripts allow-same-origin"
      ></iframe>
    </div>
  );
};