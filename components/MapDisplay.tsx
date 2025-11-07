import React, { useState, useEffect } from 'react';

const mapUrls = [
  'https://earth.nullschool.net/#current/wind/surface/level/orthographic=121.71,17.63,1427/loc=134.515,12.156',
  'https://earth.nullschool.net/#current/ocean/primary/waves/overlay=significant_wave_height/orthographic=126.92,12.56,1427/loc=134.157,12.069',
  'https://earth.nullschool.net/#current/particulates/surface/level/overlay=pm2.5/orthographic=121.71,17.63,1427/loc=134.515,12.156',
  'https://earth.nullschool.net/#current/bio/surface/level/annot=fires/overlay=bleaching_alert_area/equirectangular=121.71,17.63,445/loc=121.714,17.626',
];

export const MapDisplay: React.FC = () => {
  const [currentMapIndex, setCurrentMapIndex] = useState(0);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentMapIndex((prevIndex) => (prevIndex + 1) % mapUrls.length);
    }, 30000); // Cycle every 30 seconds

    return () => clearInterval(intervalId); // Cleanup interval on component unmount
  }, []);

  return (
    <div className="relative w-full h-full bg-black">
      {mapUrls.map((url, index) => (
         <iframe
            key={url}
            className={`absolute top-0 left-0 w-full h-full border-0 transition-opacity duration-1000 ease-in-out ${
              currentMapIndex === index ? 'opacity-100 z-10' : 'opacity-0 z-0'
            }`}
            src={url}
            title={`Earth Map Display - View ${index + 1}`}
            allowFullScreen
            sandbox="allow-scripts allow-same-origin"
          ></iframe>
      ))}
    </div>
  );
};