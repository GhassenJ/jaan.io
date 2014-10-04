
function TsneMusicVisualizer(pointCloudSvgNode,songVisualizerSvgNode){
	
	var self = this;
	this._tsne = new tsnejs.tSNE();
	var AudioContext = window.AudioContext || window.webkitAudioContext;
	this._audioContext = new AudioContext();
	this._animating = false;
	this._stopAnimatingSwitch = false;
	
	//criteria for stopping in terms of T-SNE cost difference
	this._epsilon = Math.pow(10,-15);
	
	
	//initialize the point cloud visualizer's visual settings
	this._pointCloud = new PointCloudVisualizer(pointCloudSvgNode);
	
	//music chunks later in the song are colored lighter
	this._pointCloud.setColoringFunction(this._chunkColoringFunction);
	this._pointCloud.setMouseoverPointFunction(this._chunkMouseoverFunction.bind(this));
	//when point cloud has a chunk highlighted, song amplitude viz should also highlight it (and vice versa)
	this._pointCloud.setHighlightedCallback(function(i){
		self._songAmplitudeViz.highlightIdx(i);
	});
	this._pointCloud.setDeHighlightedCallback(function(i){
		self._songAmplitudeViz.deHighlightIdx(i);
	});
	
	this._playThroughClusterStopTrigger = {};
	
	/*
	TsneMusicVisualizer.prototype._chunkMouseoverFunction  = function(chunkIdx,numChunks){
	var offset = chunkIdx * this._chunkDuration;
	this._playSound(offset);
}

TsneMusicVisualizer.prototype._playSound = function(offset){
*/

	this._pointCloud.setToggleClusterCallback(function(clusterIdx,clusterIndices){
		self._playThroughClusterStopTrigger[clusterIdx] = false;
		function timeout(i,lastIdx){
			//console.log("here");
			//console.log(self._chunkDuration);
			if(self._playThroughClusterStopTrigger[clusterIdx] === true){
				return;
			}
			var chunkIdx = clusterIndices[i];
			var offset = chunkIdx * self._chunkDuration;
			self._playSound(offset);
			self._pointCloud.deHighlightIdx(lastIdx);
			self._pointCloud.highlightIdx(chunkIdx);
			
			//play the next available chunk
			i = (i+1) % clusterIndices.length;
			console.log(i);
			setTimeout(timeout.bind(self,i,chunkIdx),self._chunkDuration*1000);
		}
		
		timeout(0);
	});
	
	this._pointCloud.setDeToggleClusterCallback(function(clusterIdx){
		self._playThroughClusterStopTrigger[clusterIdx] = true;
	});
	
	//initialize the sound amplitude visualizer settings
	this._songAmplitudeViz = new SongAmplitudeVisualizer(songVisualizerSvgNode);
	//for now, use same mouseover and coloring behavior as point cloud
	this._songAmplitudeViz.setColoringFunction(this._chunkColoringFunction);
	this._songAmplitudeViz.setMouseoverPointFunction(this._chunkMouseoverFunction.bind(this));
	this._songAmplitudeViz.setHighlightedCallback(function(i){
		self._pointCloud.highlightIdx(i);
	});
	this._songAmplitudeViz.setDeHighlightedCallback(function(i){
		self._pointCloud.deHighlightIdx(i);
	});
	
	
	
	//following variables unitialized until music is loaded
	this._musicBuffer = null;
	this._chunkLength = null;
	this._chunkDuration = null;
	
	//unitialized until TSNE is loaded
	this._lastCost = null;
}

TsneMusicVisualizer.prototype._chunkColoringFunction = function(chunkIdx,numChunks){
	var greyVal = (chunkIdx/numChunks)*230; 
	return d3.rgb(greyVal,greyVal,greyVal);
}

TsneMusicVisualizer.prototype._chunkMouseoverFunction  = function(chunkIdx,numChunks){
	var offset = chunkIdx * this._chunkDuration;
	this._playSound(offset);
}

TsneMusicVisualizer.prototype._playSound = function(offset){
	var source = this._audioContext.createBufferSource();
	source.buffer = this._musicBuffer;
	source.connect(this._audioContext.destination);

	source.start(0,offset);
	soundPlaying = true;
	setTimeout(function(){source.stop(0);},this._chunkDuration*1000);
	//source.stop(duration);
}

			
TsneMusicVisualizer.prototype.loadMusicFromUrl = function(musicUrl){
	musicUrl = musicUrl;
	
	var request = new XMLHttpRequest();
	
	request.open('GET', musicUrl,true);
	request.responseType = 'arraybuffer';
	
	var self = this;
	request.onload = function(){
		self._loadMusicFromBuffer(request.response);
	}
	
	request.send();
}

TsneMusicVisualizer.prototype.loadMusicFromFileNode = function(fileNode){
	var files = fileNode.node().files;
	if (!files.length) {
	  alert('Please select a file!');
	  return;
	}

	var file = files[0];

	var reader = new FileReader();

	var self = this;
	reader.onloadend = function(evt) {
	  if (evt.target.readyState == FileReader.DONE) { // DONE == 2
		self._loadMusicFromBuffer(reader.result);
		
	  }
	};
	reader.readAsArrayBuffer(file);
}

TsneMusicVisualizer.prototype._getNChunks = function(){
	return Math.floor(this._bufferData.length/this._chunkLength);
}

TsneMusicVisualizer.prototype._updateSongVisualizer = function(){
	//now get the chunk amplitudes to feed into the song visualizer
	var chunkAvgAmplitudes = new Float32Array(this._getNChunks());
	bufferData = this._bufferData; //tight loop optimizations, avoid member lookup
	var chunkLength = this._chunkLength;
	
	for(var i = 0,idx=0; i< bufferData.length; i+= chunkLength,idx++){
		var chunkTotal = 0;
		
		for (var j = i; j<i+chunkLength; j++){
			var sample = bufferData[j];
			chunkTotal += sample || 0;
		}
		chunkAvgAmplitudes[idx] = chunkTotal;
	}
	
	this._songAmplitudeViz.update(chunkAvgAmplitudes);
	this._songAmplitudeViz.render();
}

TsneMusicVisualizer.prototype._initTsne = function(featureData){
	this._tsne.initDataRaw(featureData);
	this._lastCost = Number.MAX_VALUE;
}

TsneMusicVisualizer.prototype._loadMusicFromBuffer = function(arrayBuffer){

	var self = this;
	this._audioContext.decodeAudioData(arrayBuffer, function(audioBuffer){
		self._musicBuffer = audioBuffer;
		self._chunkLength = 16384;
		self._chunkDuration = self._chunkLength/audioBuffer.sampleRate;
		self._bufferData = audioBuffer.getChannelData(0);

		self._getFeaturesFromMusicBufferAsync(function(spectogramData){
			self._initTsne(spectogramData);
			self.stepAndDraw();
		});
		
		self._updateSongVisualizer();
		
	},function(e){alert('error' + e)});
}

//continuation(dataArray) should be a function that takes dataArray, an array of feature arrays,
//and performs some action on them when ready
TsneMusicVisualizer.prototype._getFeaturesFromMusicBufferAsync = function(continuation){
	
	var chunkLength = this._chunkLength;
	var bufferData = this._bufferData;
	//console.log("Buffer length is " + bufferData.length);
	var nChunks = Math.floor(bufferData.length/chunkLength);
	//console.log("Number of samples is " + nChunks);
	
	
	var datas = new Array(nChunks);
	var processedChunks = 0;
	
	var numWorkers = 4;
	var fftWorkers = [];
	
	function onWorkerMessage(evt){

		var output = evt.data;
		datas[output.chunkNo] = output.features;  
		if(++processedChunks == nChunks){
			blah = datas;
			continuation(datas);
			
		}
	}
	
	for(var i = 0; i<numWorkers; i++){
		fftWorkers.push(new Worker('feature_extraction_worker.js'));
		fftWorkers[i].onmessage = onWorkerMessage;
	}
	
	//raw sample data to be passed into webworker
	var samples = new Float32Array(chunkLength);
	
	for(var i = 0; i<nChunks; i++){
	
		for(var j = 0; j<chunkLength; j++){
			samples[j] = bufferData[chunkLength*i+j];
		}
		
		var worker = fftWorkers[i%numWorkers];
		worker.postMessage({chunkNo:i, samples:samples, chunkDuration:this._chunkDuration});
	}
}

TsneMusicVisualizer.prototype.step = function(steps){
	var steps = steps || 1;
	
	for(var i = 0; i<steps; i++){
		var cost = this._tsne.step();
	}
	
	var costDiff = cost-this._lastCost;
	this._lastCost = cost;
	
	var newPoints = this._tsne.getSolution();
	this._pointCloud.update(newPoints);
	
	//console.log(costDiff);
	return Math.abs(costDiff);
}

TsneMusicVisualizer.prototype.draw = function(){
	this._pointCloud.draw();
}

TsneMusicVisualizer.prototype.stepAndDraw = function(){
	var costDiff = this.step();
	this.draw();
	return costDiff;
}


TsneMusicVisualizer.prototype.stopAnimate = function(){
	this._stopAnimatingSwitch = true;
}

TsneMusicVisualizer.prototype.animate = function(stopContinuation){
	var costDiff = this.stepAndDraw(1);
	if((costDiff < this._epsilon) || this._stopAnimatingSwitch){
		this._animating =false;
		this._stopAnimatingSwitch = false;
		stopContinuation && stopContinuation();
		return;
	}
	this._animating = true;
	requestAnimationFrame(this.animate.bind(this,stopContinuation));
	
}

TsneMusicVisualizer.prototype.getKMeans = function(){
	this._pointCloud.getKMeans();
}





