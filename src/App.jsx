import React, { useState, useRef, useCallback } from 'react';
import RandomGenerator from './RandomGenerator';
import WordArranger from './WordArranger';

export default function App() {
    const [currentApp, setCurrentApp] = useState('random'); // 'random' or 'word'
    const touchStartX = useRef(null);
    const touchStartY = useRef(null);

    const handleTouchStart = useCallback((e) => {
        touchStartX.current = e.touches[0].clientX;
        touchStartY.current = e.touches[0].clientY;
    }, []);

    const handleTouchEnd = useCallback((e) => {
        if (touchStartX.current === null || touchStartY.current === null) return;

        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const deltaX = touchEndX - touchStartX.current;
        const deltaY = touchEndY - touchStartY.current;

        // Require minimum horizontal distance and horizontal > vertical movement
        const minSwipeDistance = 80;
        if (Math.abs(deltaX) > minSwipeDistance && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
            if (deltaX > 0) {
                // Swipe right -> go to random
                setCurrentApp('random');
            } else {
                // Swipe left -> go to word
                setCurrentApp('word');
            }
        }

        touchStartX.current = null;
        touchStartY.current = null;
    }, []);

    return (
        <div
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            style={{ minHeight: '100vh' }}
        >
            {currentApp === 'random' ? (
                <RandomGenerator onSwitchApp={() => setCurrentApp('word')} />
            ) : (
                <WordArranger onSwitchApp={() => setCurrentApp('random')} />
            )}
        </div>
    );
}
