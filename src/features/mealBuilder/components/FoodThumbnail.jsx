import React from 'react';

import FoodVisualMedia from './FoodVisualMedia';



export default function FoodThumbnail({

  name,

  customImage,

  customEmoji,

  customIcon = null,

  iconOverride = null,

  iconTag = null,

  semanticIconTag = null,

  visual = null,

  sizeClassName = 'h-10 w-10',

  emojiClassName = 'text-xl',

  className = '',

}) {

  const resolvedVisual = visual || {

    name,

    customImage,

    customEmoji,

    customIcon,

    iconOverride,

    iconTag,

    semanticIconTag: semanticIconTag || iconOverride || iconTag || customIcon || null,

  };



  return (

    <div

      className={`flex shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br from-slate-700/50 to-slate-900/70 ${sizeClassName} ${className}`}

    >

      <FoodVisualMedia

        visual={resolvedVisual}

        name={name}

        compact

        emojiClassName={emojiClassName}

        iconClassName="h-[58%] w-[58%]"

        wrapperClassName="h-full w-full"

        className="h-full w-full"

      />

    </div>

  );

}

